#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  🛡️  Sentinel Method v2.0 — Interactive Launcher                 ║
# ║  Seleciona projeto via Finder, executa quality gate completo,    ║
# ║  salva resultados no diretório escolhido.                        ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Script location (resolve symlinks) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SENTINEL_BIN="${SCRIPT_DIR}/dist/cli.js"

# ── Helpers ──

print_banner() {
  local GRAY='\033[38;5;240m'
  echo ""
  echo -e "${GRAY}  ┌─────────────────────────────────────────────────────────────────┐${NC}"
  echo -e "${GRAY}  │${NC}                                                                 ${GRAY}│${NC}"
  echo -e "${GRAY}  │${NC}  ${CYAN}${BOLD}🛡️  SENTINEL METHOD v2.0${NC}  ${DIM}Production-Grade Quality Gate${NC}      ${GRAY}│${NC}"
  echo -e "${GRAY}  │${NC}  ${DIM}@girardelli/sentinel-method — powered by Girardelli Tecnologia${NC}${GRAY}│${NC}"
  echo -e "${GRAY}  │${NC}                                                                 ${GRAY}│${NC}"
  echo -e "${GRAY}  └─────────────────────────────────────────────────────────────────┘${NC}"
  echo ""
}

print_step() {
  echo -e "\n${BLUE}▸${NC} ${BOLD}$1${NC}"
}

print_success() {
  echo -e "  ${GREEN}✅ $1${NC}"
}

print_warn() {
  echo -e "  ${YELLOW}⚠️  $1${NC}"
}

print_error() {
  echo -e "  ${RED}❌ $1${NC}"
}

print_info() {
  echo -e "  ${DIM}$1${NC}"
}

# ── OS Detection ──

detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)  echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

OS=$(detect_os)

# ── Folder Picker ──

pick_folder() {
  local prompt="$1"
  local default_path="${2:-$HOME}"
  local result=""

  case "$OS" in
    macos)
      result=$(osascript -e "
        set selectedFolder to choose folder with prompt \"$prompt\" default location POSIX file \"$default_path\"
        return POSIX path of selectedFolder
      " 2>/dev/null) || true
      ;;
    linux)
      if command -v zenity &>/dev/null; then
        result=$(zenity --file-selection --directory --title="$prompt" 2>/dev/null) || true
      elif command -v kdialog &>/dev/null; then
        result=$(kdialog --getexistingdirectory "$default_path" --title "$prompt" 2>/dev/null) || true
      fi
      ;;
    windows)
      result=$(powershell.exe -Command "
        Add-Type -AssemblyName System.Windows.Forms
        \$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        \$dialog.Description = '$prompt'
        \$dialog.SelectedPath = '$default_path'
        if (\$dialog.ShowDialog() -eq 'OK') { \$dialog.SelectedPath }
      " 2>/dev/null | tr -d '\r') || true
      ;;
  esac

  # Fallback: terminal input
  if [ -z "$result" ]; then
    echo "" >&2
    echo -e "  ${YELLOW}Não foi possível abrir o seletor de pasta.${NC}" >&2
    echo -e "  ${DIM}Digite o caminho manualmente:${NC}" >&2
    read -rp "  > " result </dev/tty
  fi

  # Remove trailing slash
  echo "${result%/}"
}

# ── Menu de Análise ──

show_analysis_menu() {
  echo "" >&2
  echo -e "${BOLD}Selecione a análise a executar:${NC}" >&2
  echo "" >&2
  echo -e "  ${CYAN}1)${NC} 🛡️  Validação completa     ${DIM}(console — todos os 7 validators)${NC}" >&2
  echo -e "  ${CYAN}2)${NC} 📊 Report JSON             ${DIM}(output JSON para CI/CD pipelines)${NC}" >&2
  echo -e "  ${CYAN}3)${NC} 📝 Report Markdown          ${DIM}(relatório em Markdown)${NC}" >&2
  echo -e "  ${CYAN}4)${NC} 🌐 Report HTML              ${DIM}(relatório visual com gráficos SVG)${NC}" >&2
  echo -e "  ${CYAN}5)${NC} 🔐 Security only            ${DIM}(foco em OWASP/CWE — strict mode)${NC}" >&2
  echo -e "  ${CYAN}6)${NC} ⚙️  Init projeto             ${DIM}(gera .sentinelrc.json + .sentinelignore)${NC}" >&2
  echo -e "  ${CYAN}7)${NC} 🪝 Instalar git hooks       ${DIM}(pre-commit + pre-push)${NC}" >&2
  echo -e "  ${CYAN}8)${NC} 🚀 TUDO                     ${DIM}(JSON + HTML + Markdown reports)${NC}" >&2
  echo "" >&2
  read -rp "  Opção [1-8] (default: 8): " choice </dev/tty
  echo "${choice:-8}"
}

# ── Validações ──

check_prerequisites() {
  print_step "Verificando pré-requisitos..."

  # Node.js
  if ! command -v node &>/dev/null; then
    print_error "Node.js não encontrado. Instale: https://nodejs.org"
    exit 1
  fi
  local node_version
  node_version=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_version" -lt 18 ]; then
    print_error "Node.js >= 18 necessário. Atual: $(node -v)"
    exit 1
  fi
  print_success "Node.js $(node -v)"

  # npm dependencies (precisa vir antes do build)
  if [ ! -d "${SCRIPT_DIR}/node_modules" ]; then
    print_warn "Dependências não instaladas. Instalando..."
    (cd "$SCRIPT_DIR" && npm install)
    print_success "Dependências instaladas"
  else
    print_success "Dependências OK"
  fi

  # Sentinel built?
  if [ ! -f "$SENTINEL_BIN" ]; then
    print_warn "Sentinel não compilado. Compilando agora..."
    (cd "$SCRIPT_DIR" && npm run build)
    if [ ! -f "$SENTINEL_BIN" ]; then
      print_error "Falha ao compilar. Rode: cd $SCRIPT_DIR && npm run build"
      exit 1
    fi
    print_success "Build concluído"
  else
    print_success "Sentinel compilado"
  fi
}

# ── Execução das Análises ──

run_validate_console() {
  local project="$1"
  local project_name
  project_name=$(basename "$project")

  print_step "Executando validação completa de ${BOLD}${project_name}${NC}..."
  node "$SENTINEL_BIN" validate "$project" -t 0 -m 0 || true
}

run_validate_json() {
  local project="$1"
  local output_dir="$2"
  local project_name
  project_name=$(basename "$project")

  print_step "Gerando report JSON de ${BOLD}${project_name}${NC}..."
  node "$SENTINEL_BIN" validate "$project" --json -t 0 -m 0 \
    > "${output_dir}/sentinel-report-${project_name}.json" 2>/dev/null || true
  print_success "Report JSON: sentinel-report-${project_name}.json"
}

run_validate_markdown() {
  local project="$1"
  local output_dir="$2"
  local project_name
  project_name=$(basename "$project")

  print_step "Gerando report Markdown de ${BOLD}${project_name}${NC}..."
  node "$SENTINEL_BIN" validate "$project" -f markdown -t 0 -m 0 \
    -o "${output_dir}/sentinel-report-${project_name}.md" || true
  print_success "Report Markdown: sentinel-report-${project_name}.md"
}

run_validate_html() {
  local project="$1"
  local output_dir="$2"
  local project_name
  project_name=$(basename "$project")

  print_step "Gerando report HTML de ${BOLD}${project_name}${NC}..."
  node "$SENTINEL_BIN" validate "$project" -t 0 -m 0 \
    -o "${output_dir}/sentinel-report-${project_name}.html" || true
  print_success "Report HTML: sentinel-report-${project_name}.html"
}

run_security_only() {
  local project="$1"
  local output_dir="$2"
  local project_name
  project_name=$(basename "$project")

  print_step "Executando scan de segurança (strict) em ${BOLD}${project_name}${NC}..."
  node "$SENTINEL_BIN" validate "$project" -s strict --min-severity error --json -t 0 -m 0 \
    > "${output_dir}/sentinel-security-${project_name}.json" 2>/dev/null || true

  # Contar issues de segurança
  local sec_issues
  sec_issues=$(node -e "
    const r = require('${output_dir}/sentinel-security-${project_name}.json');
    const sec = r.results.find(v => v.validator === 'Security Scanning');
    console.log(sec ? sec.issues.length : 0);
  " 2>/dev/null || echo "?")
  print_success "Security issues encontradas: ${sec_issues}"
  print_success "Report: sentinel-security-${project_name}.json"
}

run_init() {
  local project="$1"
  local project_name
  project_name=$(basename "$project")

  print_step "Inicializando Sentinel em ${BOLD}${project_name}${NC}..."
  (cd "$project" && node "$SENTINEL_BIN" init) || true
}

run_hooks() {
  local project="$1"
  local project_name
  project_name=$(basename "$project")

  print_step "Instalando git hooks em ${BOLD}${project_name}${NC}..."
  (cd "$project" && node "$SENTINEL_BIN" hooks --install) || true
}

# ── Open Results ──

open_results() {
  local output_dir="$1"

  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "  ${BOLD}✅ Análise concluída!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${DIM}Resultados salvos em:${NC}"
  echo -e "  ${BOLD}${output_dir}${NC}"
  echo ""

  # List generated files
  echo -e "  ${DIM}Arquivos gerados:${NC}"
  for f in "${output_dir}"/sentinel-*; do
    [ -e "$f" ] && echo -e "  ${CYAN}📄${NC} $(basename "$f")"
  done

  echo ""
  read -rp "  Abrir pasta de resultados? [S/n]: " open_choice </dev/tty
  open_choice="${open_choice:-S}"

  if [[ "$open_choice" =~ ^[Ss]$ ]]; then
    case "$OS" in
      macos)   open "$output_dir" ;;
      linux)   xdg-open "$output_dir" 2>/dev/null || true ;;
      windows) explorer.exe "$output_dir" 2>/dev/null || true ;;
    esac
  fi

  # Try to open HTML report
  local html_report
  html_report=$(find "$output_dir" -name "sentinel-report-*.html" -maxdepth 1 2>/dev/null | head -1)
  if [ -n "$html_report" ]; then
    read -rp "  Abrir report HTML no browser? [S/n]: " browser_choice </dev/tty
    browser_choice="${browser_choice:-S}"
    if [[ "$browser_choice" =~ ^[Ss]$ ]]; then
      case "$OS" in
        macos)   open "$html_report" ;;
        linux)   xdg-open "$html_report" 2>/dev/null || true ;;
        windows) start "$html_report" 2>/dev/null || true ;;
      esac
    fi
  fi
}

# ── Main ──

main() {
  print_banner
  check_prerequisites

  # ── Step 1: Select project ──
  print_step "Selecione o projeto para validar"
  print_info "Uma janela do Finder/Explorer será aberta..."

  PROJECT_PATH=$(pick_folder "🛡️ Sentinel — Selecione o PROJETO para validar" "$HOME")

  if [ -z "$PROJECT_PATH" ] || [ ! -d "$PROJECT_PATH" ]; then
    print_error "Nenhum projeto selecionado ou diretório inválido."
    exit 1
  fi
  print_success "Projeto: ${PROJECT_PATH}"

  # Quick validation — does it look like a code project?
  local file_count
  file_count=$(find "$PROJECT_PATH" -maxdepth 3 -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.dart" -o -name "*.go" -o -name "*.java" -o -name "*.rs" -o -name "*.rb" -o -name "*.php" -o -name "*.cs" \) 2>/dev/null | wc -l | tr -d ' ') || file_count=0
  if [ "$file_count" -eq 0 ]; then
    print_warn "Nenhum arquivo de código encontrado nas primeiras 3 camadas."
    read -rp "  Continuar mesmo assim? [s/N]: " continue_choice </dev/tty
    if [[ ! "$continue_choice" =~ ^[Ss]$ ]]; then
      echo "  Abortado."
      exit 0
    fi
  else
    print_info "Encontrados ${file_count} arquivos de código"
  fi

  # ── Step 2: Choose analysis ──
  CHOICE=$(show_analysis_menu)

  # For options that generate files, pick output directory
  OUTPUT_PATH=""
  if [[ "$CHOICE" =~ ^[2345678]$ ]]; then
    print_step "Selecione onde salvar os resultados"
    print_info "Uma janela do Finder/Explorer será aberta..."

    OUTPUT_PATH=$(pick_folder "🛡️ Sentinel — Selecione DESTINO dos resultados" "$HOME/Documents")

    if [ -z "$OUTPUT_PATH" ]; then
      OUTPUT_PATH="${PROJECT_PATH}/sentinel-results"
      print_warn "Nenhum destino selecionado. Usando: ${OUTPUT_PATH}"
    fi

    mkdir -p "$OUTPUT_PATH"
    print_success "Destino: ${OUTPUT_PATH}"
  elif [[ "$CHOICE" == "1" ]]; then
    # Console only — mas perguntar se quer HTML também
    echo "" >&2
    read -rp "  Deseja também gerar report HTML? [S/n]: " also_html </dev/tty
    also_html="${also_html:-S}"
    if [[ "$also_html" =~ ^[Ss]$ ]]; then
      print_step "Selecione onde salvar o report HTML"
      print_info "Uma janela do Finder/Explorer será aberta..."
      OUTPUT_PATH=$(pick_folder "🛡️ Sentinel — Selecione DESTINO do report" "$HOME/Documents")
      if [ -z "$OUTPUT_PATH" ]; then
        OUTPUT_PATH="${PROJECT_PATH}/sentinel-results"
        print_warn "Nenhum destino selecionado. Usando: ${OUTPUT_PATH}"
      fi
      mkdir -p "$OUTPUT_PATH"
      print_success "Destino: ${OUTPUT_PATH}"
      CHOICE="1+html"
    fi
  fi

  # ── Step 3: Execute ──
  local start_time
  start_time=$(date +%s)

  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
  echo -e "  ${BOLD}🚀 Iniciando validação...${NC}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"

  case "$CHOICE" in
    1) run_validate_console "$PROJECT_PATH" ;;
    "1+html")
      run_validate_console "$PROJECT_PATH"
      run_validate_html "$PROJECT_PATH" "$OUTPUT_PATH"
      ;;
    2) run_validate_json "$PROJECT_PATH" "$OUTPUT_PATH" ;;
    3) run_validate_markdown "$PROJECT_PATH" "$OUTPUT_PATH" ;;
    4) run_validate_html "$PROJECT_PATH" "$OUTPUT_PATH" ;;
    5) run_security_only "$PROJECT_PATH" "$OUTPUT_PATH" ;;
    6) run_init "$PROJECT_PATH" ;;
    7) run_hooks "$PROJECT_PATH" ;;
    8)
      run_validate_console "$PROJECT_PATH"
      run_validate_json "$PROJECT_PATH" "$OUTPUT_PATH"
      run_validate_html "$PROJECT_PATH" "$OUTPUT_PATH"
      run_validate_markdown "$PROJECT_PATH" "$OUTPUT_PATH"
      run_security_only "$PROJECT_PATH" "$OUTPUT_PATH"
      ;;
    *)
      print_error "Opção inválida: $CHOICE"
      exit 1
      ;;
  esac

  local end_time
  end_time=$(date +%s)
  local elapsed=$((end_time - start_time))

  echo ""
  echo -e "  ${DIM}⏱️  Tempo total: ${elapsed}s${NC}"

  # ── Step 4: Open results (if files were generated) ──
  if [ -n "$OUTPUT_PATH" ] && [ -d "$OUTPUT_PATH" ]; then
    open_results "$OUTPUT_PATH"
  fi

  echo ""
  echo -e "  ${DIM}Powered by @girardelli/sentinel-method v2.0${NC}"
  echo ""
}

# ── Run ──
main "$@"
