#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

err() {
  printf '[ERROR] %s\n' "$*" >&2
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    err "缺少命令: ${cmd}"
    exit 1
  fi
}

install_nodejs() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    log "检测到 Node.js: $(node -v), npm: $(npm -v)"
    return
  fi

  if [[ "$(id -u)" -ne 0 ]]; then
    err "未检测到 Node.js/npm，且当前非 root 用户。请以 root 运行或先手动安装 Node.js 20+。"
    exit 1
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    err "当前系统无 apt-get，无法自动安装 Node.js。请手动安装 Node.js 20+ 后重试。"
    exit 1
  fi

  log "正在安装 Node.js 20.x ..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  chmod a+r /etc/apt/keyrings/nodesource.gpg

  local distro
  distro="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
  if [[ -z "${distro}" ]]; then
    err "无法识别系统版本代号 (VERSION_CODENAME)。"
    exit 1
  fi

  cat > /etc/apt/sources.list.d/nodesource.list <<EOL
deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x ${distro} main
EOL

  apt-get update -y
  apt-get install -y nodejs
  log "Node.js 安装完成: $(node -v), npm: $(npm -v)"
}

main() {
  require_cmd bash
  require_cmd curl

  install_nodejs

  log "安装项目依赖..."
  cd "${PROJECT_ROOT}"
  npm ci

  log "构建前端..."
  npm run build

  log "执行基础校验..."
  node --check backend/src/server.js
  npm run test -w frontend

  log "install 完成。"
  log "下一步: 运行 scripts/deploy-host.sh 完成主机部署。"
}

main "$@"
