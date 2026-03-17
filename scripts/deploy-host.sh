#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR_DEFAULT="/opt/jdl-device-management"
FRONTEND_DIST_REL="frontend/dist"

APP_DIR="${APP_DIR:-${APP_DIR_DEFAULT}}"
DOMAIN="${DOMAIN:-_}"
BACKEND_PORT="${BACKEND_PORT:-3101}"
SERVICE_USER="${SERVICE_USER:-www-data}"
FORCE_COPY="${FORCE_COPY:-0}"

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

err() {
  printf '[ERROR] %s\n' "$*" >&2
}

usage() {
  cat <<USAGE
用法:
  sudo DOMAIN=example.com APP_DIR=/opt/jdl-device-management BACKEND_PORT=3101 ./scripts/deploy-host.sh

可选环境变量:
  DOMAIN         Nginx server_name，默认 _
  APP_DIR        部署目录，默认 /opt/jdl-device-management
  BACKEND_PORT   后端服务端口，默认 3101
  SERVICE_USER   systemd 运行用户，默认 www-data
  FORCE_COPY     =1 时强制覆盖 APP_DIR 已有内容
USAGE
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    err "该脚本需 root 权限运行（用于安装系统依赖、写入 /etc、创建 systemd 服务）。"
    exit 1
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    err "缺少命令: ${cmd}"
    exit 1
  fi
}

install_system_packages() {
  log "安装系统依赖 (nginx, rsync)..."
  apt-get update -y
  apt-get install -y nginx rsync
}

validate_project_files() {
  local required_files=(
    "package.json"
    "backend/package.json"
    "frontend/package.json"
    "backend/src/server.js"
  )

  for file in "${required_files[@]}"; do
    if [[ ! -f "${PROJECT_ROOT}/${file}" ]]; then
      err "缺少项目文件: ${PROJECT_ROOT}/${file}"
      exit 1
    fi
  done
}

prepare_app_dir() {
  if [[ -d "${APP_DIR}" && "${FORCE_COPY}" != "1" ]]; then
    if [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
      err "${APP_DIR} 已存在且非空。若确认覆盖，请设置 FORCE_COPY=1。"
      exit 1
    fi
  fi

  mkdir -p "${APP_DIR}"

  log "同步项目文件到 ${APP_DIR} ..."
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='frontend/node_modules' \
    --exclude='backend/node_modules' \
    --exclude='frontend/dist' \
    "${PROJECT_ROOT}/" "${APP_DIR}/"
}

install_node_modules_and_build() {
  log "安装 Node.js 依赖..."
  cd "${APP_DIR}"
  npm ci

  log "构建前端..."
  npm run build

  local dist_dir="${APP_DIR}/${FRONTEND_DIST_REL}"
  if [[ ! -d "${dist_dir}" ]]; then
    err "前端构建产物不存在: ${dist_dir}"
    exit 1
  fi
}

prepare_env_files() {
  if [[ ! -f "${APP_DIR}/backend/.env" ]]; then
    if [[ -f "${APP_DIR}/backend/.env.example" ]]; then
      cp "${APP_DIR}/backend/.env.example" "${APP_DIR}/backend/.env"
      warn "已生成 backend/.env，请补全生产环境配置后重启服务。"
    else
      warn "未找到 backend/.env.example，请手动创建 backend/.env。"
    fi
  fi

  if [[ ! -f "${APP_DIR}/frontend/.env" ]]; then
    if [[ -f "${APP_DIR}/frontend/.env.example" ]]; then
      cp "${APP_DIR}/frontend/.env.example" "${APP_DIR}/frontend/.env"
      warn "已生成 frontend/.env，仅用于后续构建参考。"
    fi
  fi
}

write_systemd_service() {
  local service_file="/etc/systemd/system/jdl-device-management.service"

  log "写入 systemd 服务: ${service_file}"
  cat > "${service_file}" <<SERVICE
[Unit]
Description=JDL Device Management Backend Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=-${APP_DIR}/backend/.env
ExecStart=/usr/bin/npm run start -w backend
Restart=always
RestartSec=5
User=${SERVICE_USER}
Group=${SERVICE_USER}

[Install]
WantedBy=multi-user.target
SERVICE

  chown root:root "${service_file}"
  chmod 0644 "${service_file}"

  systemctl daemon-reload
  systemctl enable --now jdl-device-management.service
}

write_nginx_config() {
  local nginx_file="/etc/nginx/sites-available/jdl-device-management.conf"
  local dist_dir="${APP_DIR}/${FRONTEND_DIST_REL}"

  log "写入 Nginx 配置: ${nginx_file}"
  cat > "${nginx_file}" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    root ${dist_dir};
    index index.html;

    location /api/ {
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

  ln -sfn "${nginx_file}" /etc/nginx/sites-enabled/jdl-device-management.conf
  rm -f /etc/nginx/sites-enabled/default

  nginx -t
  systemctl restart nginx
}

set_permissions() {
  log "设置目录权限..."
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
}

health_check() {
  log "执行服务状态检查..."
  systemctl --no-pager --full status jdl-device-management.service >/dev/null
  curl --fail --silent --show-error "http://127.0.0.1:${BACKEND_PORT}/api/dashboard" >/dev/null || \
    warn "后端健康检查未通过（可能因缺少有效 Supabase 配置或需认证）。"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  require_root
  require_cmd apt-get
  require_cmd npm
  require_cmd systemctl
  require_cmd curl

  validate_project_files
  install_system_packages
  require_cmd nginx
  require_cmd rsync
  prepare_app_dir
  install_node_modules_and_build
  prepare_env_files
  set_permissions
  write_systemd_service
  write_nginx_config
  health_check

  log "部署完成。"
  log "前端: http://<你的域名或IP>/"
  log "后端 API 反向代理: http://<你的域名或IP>/api"
  log "如首次部署，请确认 ${APP_DIR}/backend/.env 中 Supabase 与 CORS 配置正确。"
}

main "$@"
