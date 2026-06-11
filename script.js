const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const indicadores = ["volume", "receita", "rpd"];
const HIERARQUIA = window.HIERARQUIA_DADOS || {};

let visaoAtual = "am";
let baseGrafico = "volume";
let bloqueio = "rpd";
let suavizacaoLinha = 0.35;
let gruposFechados = {};
let grafico = null;
let pontoArrastado = null;
let graficoExpandido = false;
let usuarioLogado = null;
let escopoAtual = { nivel: "diretoria", id: "DIRETORIA" };
let resumoUltimaConsolidacao = null;
let telaAtual = "dashboard";

const ordemDivisionais = ["DVCNN", "DVINT", "DVKAM", "DVSDE", "DVSME"];
const divisionais = ordemDivisionais.filter(div => HIERARQUIA[div]?.tipo === "divisional");
const especiais = Object.keys(HIERARQUIA).filter(key => HIERARQUIA[key]?.tipo === "especial");
const unidadesDiretoria = [...divisionais, ...especiais];

const volumeBaseUnidades = {
  DVCNN: [10513,10651,10730,10822,10834,10934,10822,10912,11108,11299,11521,11087],
  DVINT: [7668,8145,8583,9113,9233,9397,9699,10112,10576,11265,11549,10836],
  DVKAM: [10202,10120,10005,10029,9714,9539,9344,9238,9249,9287,9331,8742],
  DVSDE: [16207,16586,16839,17077,16916,16612,16883,17349,17295,17496,17377,16901],
  DVSME: [9001,9485,9820,9916,9730,9763,9659,9643,9758,9856,9880,9788],
  DTTRA: Array(12).fill(0)
};

const diretoriaBase = {
  volume: [6680,6766,6817,6875,6883,6900,6950,7000,7100,7200,7300,7400],
  receita: [935200,947240,954380,962500,963620,966000,973000,980000,994000,1008000,1022000,1036000]
};

function normalizarTexto(valor) {
  return String(valor || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function normalizarCodigo(valor) {
  const codigo = String(valor || "").trim().toUpperCase();
  if (["DVSUL", "DVSL"].includes(codigo)) return "DVSME";
  return codigo;
}
function carteiraId(distrital, carteira) { return `CARTEIRA|${normalizarCodigo(distrital)}|${normalizarCodigo(carteira)}`; }
function getCarteiraFromId(id) { return String(id || "").split("|")[2] || id; }
function hashCodigo(codigo) { return String(codigo || "").split("").reduce((s, ch) => s + ch.charCodeAt(0), 0); }
function array12(valor) { return Array(12).fill(valor); }
function criarMetaAjustada() { return { volume: array12(null), receita: array12(null), rpd: array12(null) }; }
function criarRegistro(volume, receita, extra = {}) {
  const vol = volume.map(v => Number(v) || 0);
  const rec = receita.map(v => Number(v) || 0);
  return { volume: vol, receita: rec, rpd: meses.map((_, i) => vol[i] > 0 ? rec[i] / vol[i] : 0), metaAjustada: criarMetaAjustada(), ...extra };
}

const maps = montarMapasHierarquia();
function montarMapasHierarquia() {
  const distritalParaDivisional = {};
  const carteirasPorDistrital = {};
  const carteiraParaIds = {};
  const distritais = [];
  unidadesDiretoria.forEach(unidade => {
    Object.entries(HIERARQUIA[unidade]?.distritais || {}).forEach(([distrital, carteiras]) => {
      distritalParaDivisional[distrital] = unidade;
      carteirasPorDistrital[distrital] = [...carteiras];
      distritais.push(distrital);
      carteiras.forEach(carteira => {
        const id = carteiraId(distrital, carteira);
        carteiraParaIds[carteira] = carteiraParaIds[carteira] || [];
        carteiraParaIds[carteira].push(id);
      });
    });
  });
  return { distritalParaDivisional, carteirasPorDistrital, carteiraParaIds, distritais: [...new Set(distritais)].sort() };
}

function distribuirSerie(parentVolume, parentReceita, filhos, pesoFn) {
  const pesosVol = filhos.map(f => Math.max(1, pesoFn(f, "volume")));
  const pesosRec = filhos.map(f => Math.max(1, pesoFn(f, "receita")));
  const totalVol = pesosVol.reduce((s, v) => s + v, 0) || 1;
  const totalRec = pesosRec.reduce((s, v) => s + v, 0) || 1;
  return filhos.reduce((acc, filho, idx) => {
    acc[filho] = { volume: parentVolume.map(v => v * pesosVol[idx] / totalVol), receita: parentReceita.map(v => v * pesosRec[idx] / totalRec) };
    return acc;
  }, {});
}

function criarBase(nome, fator) {
  const entidades = {};
  entidades.DIRETORIA = criarRegistro(
    diretoriaBase.volume.map(v => v * fator),
    diretoriaBase.receita.map(v => v * fator),
    { id: "DIRETORIA", nome: "Diretoria", nivel: "diretoria", parentId: null }
  );

  unidadesDiretoria.forEach(unidade => {
    const especial = HIERARQUIA[unidade]?.tipo === "especial";
    const volume = (volumeBaseUnidades[unidade] || array12(0)).map(v => v * fator);
    const rpdUnidade = 128 + (hashCodigo(unidade) % 32);
    const receita = volume.map((v, i) => v * (rpdUnidade + ((i % 4) - 1.5) * 1.8));
    entidades[unidade] = criarRegistro(volume, receita, {
      id: unidade,
      nome: unidade,
      nivel: especial ? "especial" : "divisional",
      divisional: especial ? (HIERARQUIA[unidade].divisionalReferencia || HIERARQUIA[unidade].referencia || unidade) : unidade,
      distrital: especial ? unidade : "",
      parentId: especial ? null : "DIRETORIA",
      especial
    });
  });

  divisionais.forEach(divisional => {
    const distritais = Object.keys(HIERARQUIA[divisional]?.distritais || {});
    const parent = entidades[divisional];
    parent.filhos = [...distritais];
    const series = distribuirSerie(parent.volume, parent.receita, distritais, (dist, indicador) => {
      const qtdCarteiras = (HIERARQUIA[divisional].distritais[dist] || []).length || 1;
      const fatorPreco = indicador === "receita" ? 85 + (hashCodigo(dist) % 35) : 100;
      return qtdCarteiras * fatorPreco;
    });
    distritais.forEach(distrital => {
      entidades[distrital] = criarRegistro(series[distrital].volume, series[distrital].receita, {
        id: distrital, nome: distrital, nivel: "distrital", divisional, distrital, parentId: divisional, especial: false
      });
    });
  });

  maps.distritais.forEach(distrital => {
    const parent = entidades[distrital];
    if (!parent) return;
    const carteiras = maps.carteirasPorDistrital[distrital] || [];
    const ids = carteiras.map(carteira => carteiraId(distrital, carteira));
    parent.filhos = [...ids];
    const series = distribuirSerie(parent.volume, parent.receita, ids, (id, indicador) => {
      const carteira = getCarteiraFromId(id);
      return indicador === "receita" ? 90 + (hashCodigo(carteira) % 30) : 100;
    });
    ids.forEach(id => {
      const carteira = getCarteiraFromId(id);
      entidades[id] = criarRegistro(series[id].volume, series[id].receita, {
        id, nome: carteira, nivel: "carteira", divisional: parent.divisional, distrital, carteira, parentId: distrital, especial: parent.especial
      });
    });
  });

  return { nome, entidades };
}

const bases = { am: criarBase("AM", 1), ad: criarBase("AD", 0.42) };
const usuarios = gerarUsuarios();
window.USUARIOS_SIMULADOR = usuarios;

function gerarUsuarios() {
  const lista = [
    { matricula: "456866", senha: "123456", nome: "Thiago do Carmo Librelon Rocha", perfil: "master", escopo: "TODOS" },
    { matricula: "100000", senha: "dir123", nome: "Diretoria Comercial", perfil: "diretor", escopo: "TODOS" },
    { matricula: "100001", senha: "DVSDE2026", nome: "Gerente Sudeste", perfil: "divisional", escopo: "DVSDE" }
  ];
  divisionais.forEach((divisional, idx) => lista.push({ matricula: String(200001 + idx), senha: `dv${String(idx + 1).padStart(3, "0")}`, nome: `Gerente Divisional ${divisional}`, perfil: "divisional", escopo: divisional }));
  maps.distritais.forEach((distrital, idx) => lista.push({ matricula: String(300001 + idx), senha: `dt${String(idx + 1).padStart(3, "0")}`, nome: `Gerente Distrital ${distrital}`, perfil: "distrital", escopo: distrital }));
  return lista;
}

function perfilAdmin() { return usuarioLogado && ["master", "diretor"].includes(usuarioLogado.perfil); }
function nomePerfil(perfil) {
  return { master: "Master", diretor: "Diretor", divisional: "Gerente Divisional", distrital: "Gerente Distrital" }[perfil] || perfil;
}
function labelEntidade(id) { if (id === "DIRETORIA") return "Diretoria"; if (id.startsWith("CARTEIRA|")) return getCarteiraFromId(id); if (id === "DTTRA") return "DTTRA (Especial)"; return id; }
function descricaoEntidade(id) {
  const e = getEntidadeModelo(id);
  if (!e) return "";
  if (e.nivel === "divisional") return "Divisional";
  if (e.nivel === "especial") return "Meta separada";
  if (e.nivel === "distrital") return `Distrital de ${e.divisional}`;
  if (e.nivel === "carteira") return `Carteira de ${e.distrital}`;
  return "";
}

function fazerLogin(event) {
  if (event && typeof event.preventDefault === "function") event.preventDefault();
  const matricula = String(document.getElementById("loginMatricula")?.value || "").trim();
  const senha = String(document.getElementById("loginSenha")?.value || "").trim();
  const usuario = usuarios.find(u => u.matricula === matricula && u.senha === senha);
  if (!usuario) { exibirStatus("loginStatus", "Matrícula ou senha inválida.", false); return; }
  usuarioLogado = usuario;
  inicializarEscopoUsuario();
  document.body.classList.add("logged-in");
  document.body.classList.remove("logged-out", "app-locked");
  document.getElementById("loginOverlay")?.classList.add("hidden");
  const loginStatus = document.getElementById("loginStatus");
  if (loginStatus) loginStatus.classList.add("hidden");
  const senhaInput = document.getElementById("loginSenha");
  if (senhaInput) senhaInput.value = "";
  preencherControlesEscopo();
  render();
}
function sair() {
  usuarioLogado = null;
  if (grafico) { grafico.destroy(); grafico = null; }
  document.body.classList.remove("logged-in");
  document.body.classList.add("logged-out", "app-locked");
  document.getElementById("loginOverlay")?.classList.remove("hidden");
  const senha = document.getElementById("loginSenha");
  if (senha) senha.value = "";
  document.getElementById("loginMatricula")?.focus();
}
function inicializarEscopoUsuario() {
  if (!usuarioLogado) return;
  if (perfilAdmin()) escopoAtual = { nivel: "diretoria", id: "DIRETORIA" };
  else if (usuarioLogado.perfil === "divisional") escopoAtual = { nivel: "divisional", id: usuarioLogado.escopo };
  else if (usuarioLogado.perfil === "distrital") escopoAtual = { nivel: "distrital", id: usuarioLogado.escopo };
  gruposFechados = {};
}
function preencherControlesEscopo() {
  const nivelSelect = document.getElementById("nivelSelect");
  const escopoSelect = document.getElementById("escopoSelect");
  if (!nivelSelect || !escopoSelect) return;
  nivelSelect.value = escopoAtual.nivel;
  escopoSelect.innerHTML = "";
  if (escopoAtual.nivel === "diretoria") {
    escopoSelect.disabled = true;
    escopoSelect.innerHTML = `<option value="DIRETORIA">Diretoria</option>`;
    return;
  }
  escopoSelect.disabled = false;
  const opcoes = escopoAtual.nivel === "divisional" ? divisionais : maps.distritais;
  opcoes.forEach(opcao => {
    const opt = document.createElement("option");
    opt.value = opcao;
    opt.textContent = labelEntidade(opcao);
    escopoSelect.appendChild(opt);
  });
  if (!opcoes.includes(escopoAtual.id)) escopoAtual.id = opcoes[0] || "DIRETORIA";
  escopoSelect.value = escopoAtual.id;
}
function alterarNivelTrabalho(nivel) {
  if (!perfilAdmin()) return;
  escopoAtual.nivel = nivel;
  escopoAtual.id = nivel === "diretoria" ? "DIRETORIA" : nivel === "divisional" ? divisionais[0] : maps.distritais[0];
  gruposFechados = {};
  preencherControlesEscopo();
  render();
}
function alterarEscopoTrabalho(id) { if (!perfilAdmin()) return; escopoAtual.id = id; gruposFechados = {}; render(); }
function renderPermissoes() {
  const admin = perfilAdmin();
  if (typeof document.querySelectorAll === "function") document.querySelectorAll(".admin-only, .master-only, [data-master-only]").forEach(el => el.classList.toggle("hidden", !admin));
  document.getElementById("adminScopeControls")?.classList.toggle("hidden", !admin);
  const fixed = document.getElementById("fixedScopeInfo");
  if (fixed) {
    fixed.classList.toggle("hidden", admin);
    fixed.innerText = usuarioLogado && !admin ? `${nomePerfil(usuarioLogado.perfil)} | Escopo bloqueado: ${labelEntidade(usuarioLogado.escopo)}` : "";
  }
  if (usuarioLogado) {
    const textoUsuario = `${usuarioLogado.nome} | ${nomePerfil(usuarioLogado.perfil)} | Matrícula ${usuarioLogado.matricula}`;
    const badge = document.getElementById("usuarioBadge");
    if (badge) badge.innerText = textoUsuario;
    const userName = document.getElementById("userName");
    const userScope = document.getElementById("userScope");
    if (userName) userName.innerText = usuarioLogado.nome;
    if (userScope) userScope.innerText = `${nomePerfil(usuarioLogado.perfil)} | Escopo: ${perfilAdmin() ? tituloEscopo() : labelEntidade(usuarioLogado.escopo)}`;
  }
}
function tituloEscopo() { if (escopoAtual.nivel === "diretoria") return "Diretoria"; if (escopoAtual.nivel === "divisional") return `Divisional ${escopoAtual.id}`; return escopoAtual.id === "DTTRA" ? "Distrital Especial DTTRA" : `Distrital ${escopoAtual.id}`; }
function descricaoEscopo() { if (escopoAtual.nivel === "diretoria") return "Distribuição da diretoria para divisionais. DTTRA é tratado como meta separada."; if (escopoAtual.nivel === "divisional") return `Distribuição de ${escopoAtual.id} para suas distritais.`; return `Distribuição de ${escopoAtual.id} para suas carteiras.`; }
function atualizarCabecalhoEscopo() { const t = document.getElementById("escopoTitulo"); const d = document.getElementById("escopoDescricao"); if (t) t.innerText = tituloEscopo(); if (d) d.innerText = descricaoEscopo(); }

function toggleSidebar() { document.getElementById("sidebar")?.classList.toggle("collapsed"); document.getElementById("main")?.classList.toggle("expanded"); }
function ocultarSidebar() { document.getElementById("sidebar")?.classList.add("hidden-sidebar"); document.getElementById("main")?.classList.add("full"); document.getElementById("showSidebarBtn")?.classList.add("visible"); }
function mostrarSidebar() { document.getElementById("sidebar")?.classList.remove("hidden-sidebar"); document.getElementById("main")?.classList.remove("full"); document.getElementById("showSidebarBtn")?.classList.remove("visible"); }
function mostrarTela(tela) {
  telaAtual = tela;
  document.getElementById("telaDashboard")?.classList.toggle("hidden", tela !== "dashboard");
  document.getElementById("telaCascata")?.classList.toggle("hidden", tela !== "cascata");
  document.getElementById("telaShare")?.classList.toggle("hidden", tela !== "share");
  document.getElementById("telaConsolidar")?.classList.toggle("hidden", tela !== "consolidar");
  document.getElementById("navDashboard")?.classList.toggle("active", tela === "dashboard");
  document.getElementById("navCascata")?.classList.toggle("active", tela === "cascata");
  document.getElementById("navShare")?.classList.toggle("active", tela === "share");
  document.getElementById("navConsolidar")?.classList.toggle("active", tela === "consolidar");
  render();
}
function alterarVisao(visao) { visaoAtual = visao; render(); }
function alterarBaseGrafico(base) { baseGrafico = base; renderGrafico(); }
function alterarSuavizacao(valor) { suavizacaoLinha = Number(valor) / 100; const label = document.getElementById("suavizacaoValor"); if (label) label.innerText = `${valor}%`; renderGrafico(); }
function alternarGraficoExpandido() { graficoExpandido = !graficoExpandido; document.getElementById("cardGraficoMetas")?.classList.toggle("chart-expanded", graficoExpandido); const b = document.getElementById("expandirGraficoBtn"); if (b) b.innerText = graficoExpandido ? "Reduzir gráfico" : "Expandir gráfico"; setTimeout(() => { if (grafico) grafico.resize(); }, 50); }
function alterarBloqueio(valor) { bloqueio = valor; aplicarTrianguloTodos(); render(); }
function toggleGrupo(id) { gruposFechados[id] = !gruposFechados[id]; renderTabela(); }

function getEntidade(view, id) { return bases[view]?.entidades[id] || null; }
function getEntidadeModelo(id) { return getEntidade("am", id) || getEntidade("ad", id); }
function getFilhos(parentId) { if (parentId === "DIRETORIA") return unidadesDiretoria; const e = getEntidadeModelo(parentId); return e ? e.filhos || [] : []; }
function getFilhosEscopo() { return escopoAtual.nivel === "diretoria" ? getFilhos("DIRETORIA") : getFilhos(escopoAtual.id); }
function getParentIdEscopo() { return escopoAtual.nivel === "diretoria" ? "DIRETORIA" : escopoAtual.id; }
function siblingsParaShare(id) { const e = getEntidadeModelo(id); if (!e) return []; if (e.nivel === "divisional") return divisionais; if (e.parentId) return getFilhos(e.parentId); return []; }

function parseNumero(valor) {
  if (valor === null || valor === undefined) return 0;
  const texto = String(valor).trim().replace(/%$/, "");
  if (!texto) return 0;
  const temVirgula = texto.includes(",");
  const temPonto = texto.includes(".");
  if (temVirgula && temPonto) return parseFloat(texto.replace(/\./g, "").replace(",", ".")) || 0;
  if (temVirgula) return parseFloat(texto.replace(",", ".")) || 0;
  return parseFloat(texto) || 0;
}
function fmt(valor, indicador) { if (indicador === "rpd") return (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); return Math.round(valor || 0).toLocaleString("pt-BR"); }
function fmtShare(valor) { return `${((valor || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; }
function soma(arr) { return arr.reduce((s, v) => s + (v || 0), 0); }
function visaoCalculo() { return visaoAtual === "comparar" ? "am_ad" : visaoAtual; }
function aplicarTriangulo(obj, i) { const volume = obj.volume[i] || 0; const receita = obj.receita[i] || 0; const rpd = obj.rpd[i] || 0; if (bloqueio === "rpd") obj.rpd[i] = volume > 0 ? receita / volume : 0; if (bloqueio === "volume") obj.volume[i] = rpd > 0 ? receita / rpd : 0; if (bloqueio === "receita") obj.receita[i] = volume * rpd; }
function aplicarTrianguloTodos() { ["am", "ad"].forEach(view => { Object.values(bases[view].entidades).forEach(entidade => { for (let i = 0; i < 12; i++) aplicarTriangulo(entidade, i); }); }); }

function valorDiretoriaView(view, indicador, i) {
  if (view !== "am_ad") return bases[view].entidades.DIRETORIA[indicador][i] || 0;
  if (indicador === "volume") return valorDiretoriaView("am", "volume", i) + valorDiretoriaView("ad", "volume", i);
  if (indicador === "receita") return valorDiretoriaView("am", "receita", i) + valorDiretoriaView("ad", "receita", i);
  const volume = valorDiretoriaView("am_ad", "volume", i);
  const receita = valorDiretoriaView("am_ad", "receita", i);
  return volume > 0 ? receita / volume : 0;
}
function valorRealizadoView(view, id, indicador, i) {
  if (view !== "am_ad") { const e = getEntidade(view, id); return e ? (e[indicador][i] || 0) : 0; }
  if (indicador === "volume") return valorRealizadoView("am", id, "volume", i) + valorRealizadoView("ad", id, "volume", i);
  if (indicador === "receita") return valorRealizadoView("am", id, "receita", i) + valorRealizadoView("ad", id, "receita", i);
  const volume = valorRealizadoView("am_ad", id, "volume", i);
  const receita = valorRealizadoView("am_ad", id, "receita", i);
  return volume > 0 ? receita / volume : 0;
}
function valorParentPorIdView(view, parentId, indicador, i) { if (parentId === "DIRETORIA") return valorDiretoriaView(view, indicador, i); return getMetaFinalView(view, parentId, indicador, i); }
function valorParentEscopoView(view, indicador, i) { return valorParentPorIdView(view, getParentIdEscopo(), indicador, i); }
function shareView(view, id, indicador, i) {
  if (indicador === "rpd" || id === "DTTRA") return 0;
  const siblings = siblingsParaShare(id);
  if (!siblings.length) return 0;
  const total = siblings.reduce((s, sid) => s + valorRealizadoView(view, sid, indicador, i), 0);
  return total > 0 ? valorRealizadoView(view, id, indicador, i) / total : 1 / siblings.length;
}
function metaShareView(view, id, indicador, i) {
  const e = getEntidadeModelo(id); if (!e || !e.parentId) return 0;
  if (indicador === "volume" || indicador === "receita") return valorParentPorIdView(view, e.parentId, indicador, i) * shareView(view, id, indicador, i);
  const volume = metaShareView(view, id, "volume", i);
  const receita = metaShareView(view, id, "receita", i);
  return volume > 0 ? receita / volume : 0;
}
function getMetaFinalView(view, id, indicador, i) {
  if (view === "am_ad") {
    if (indicador === "rpd") { const volume = getMetaFinalView("am_ad", id, "volume", i); const receita = getMetaFinalView("am_ad", id, "receita", i); return volume > 0 ? receita / volume : 0; }
    return getMetaFinalView("am", id, indicador, i) + getMetaFinalView("ad", id, indicador, i);
  }
  if (id === "DIRETORIA") return valorDiretoriaView(view, indicador, i);
  if (indicador === "rpd") { const volume = getMetaFinalView(view, id, "volume", i); const receita = getMetaFinalView(view, id, "receita", i); return volume > 0 ? receita / volume : 0; }
  const e = getEntidade(view, id); if (!e) return 0;
  const ajuste = e.metaAjustada[indicador][i];
  if (ajuste !== null && ajuste !== undefined) return ajuste;
  return metaShareView(view, id, indicador, i);
}
function totalMetaFilhosEscopoView(view, indicador, i) {
  const filhos = getFilhosEscopo();
  if (indicador === "volume" || indicador === "receita") return filhos.reduce((s, id) => s + getMetaFinalView(view, id, indicador, i), 0);
  const volume = filhos.reduce((s, id) => s + getMetaFinalView(view, id, "volume", i), 0);
  const receita = filhos.reduce((s, id) => s + getMetaFinalView(view, id, "receita", i), 0);
  return volume > 0 ? receita / volume : 0;
}

function podeEditarEscopoAtual() { if (!usuarioLogado) return false; if (perfilAdmin()) return true; if (usuarioLogado.perfil === "divisional") return escopoAtual.nivel === "divisional" && escopoAtual.id === usuarioLogado.escopo; if (usuarioLogado.perfil === "distrital") return escopoAtual.nivel === "distrital" && escopoAtual.id === usuarioLogado.escopo; return false; }
function podeEditarParent(view, indicador) { return perfilAdmin() && escopoAtual.nivel === "diretoria" && view !== "am_ad" && visaoAtual !== "comparar" && bloqueio !== indicador; }
function podeEditarMeta(view, indicador) { return podeEditarEscopoAtual() && view !== "am_ad" && visaoAtual !== "comparar" && bloqueio !== indicador; }
function podeEditarRealizado(view, indicador) { return usuarioLogado?.perfil === "master" && view !== "am_ad" && visaoAtual !== "comparar" && bloqueio !== indicador; }

function atualizarDiretoria(view, indicador, i, valor) { if (!podeEditarParent(view, indicador)) return; bases[view].entidades.DIRETORIA[indicador][i] = parseNumero(valor); aplicarTriangulo(bases[view].entidades.DIRETORIA, i); render(); }
function atualizarMetaEntidade(view, id, indicador, i, valor) {
  if (!podeEditarMeta(view, indicador)) return;
  const e = getEntidade(view, id); if (!e) return;
  e.metaAjustada[indicador][i] = parseNumero(valor);
  const obj = { volume: [getMetaFinalView(view, id, "volume", i)], receita: [getMetaFinalView(view, id, "receita", i)], rpd: [getMetaFinalView(view, id, "rpd", i)] };
  aplicarTriangulo(obj, 0);
  e.metaAjustada.volume[i] = obj.volume[0]; e.metaAjustada.receita[i] = obj.receita[0]; e.metaAjustada.rpd[i] = obj.rpd[0];
  render();
}
function atualizarRealizadoEntidade(view, id, indicador, i, valor) { if (!podeEditarRealizado(view, indicador)) return; const e = getEntidade(view, id); if (!e) return; e[indicador][i] = parseNumero(valor); aplicarTriangulo(e, i); render(); }
function resetarMetas() { getFilhosEscopo().forEach(id => { ["am", "ad"].forEach(view => { const e = getEntidade(view, id); if (e) e.metaAjustada = criarMetaAjustada(); }); }); render(); }

function input(valor, indicador, disabled, onchange) { return `<input class="cell-input" type="text" value="${fmt(valor, indicador)}" ${disabled ? "disabled" : `onchange="${onchange}"`} />`; }
function tabelaHeader() { return `<thead><tr><th>Ind.</th>${meses.map(m => `<th>${m}</th>`).join("")}</tr></thead>`; }
function prefixoParent() { if (escopoAtual.nivel === "diretoria") return "Dir"; if (escopoAtual.nivel === "divisional") return "Div"; return escopoAtual.id === "DTTRA" ? "Esp" : "Dist"; }
function linhaParent(view, indicador, label) {
  const disabled = !podeEditarParent(view, indicador);
  let html = `<tr class="diretoria"><td>${prefixoParent()} ${label}</td>`;
  for (let i = 0; i < 12; i++) {
    const onchange = escopoAtual.nivel === "diretoria" ? `atualizarDiretoria('${view}', '${indicador}', ${i}, this.value)` : "";
    html += `<td>${input(valorParentEscopoView(view, indicador, i), indicador, disabled, onchange)}</td>`;
  }
  return html + `</tr>`;
}
function linhaGap(view, indicador, label) {
  let html = `<tr class="gap-row"><td>GAP ${label}</td>`;
  for (let i = 0; i < 12; i++) { const gap = totalMetaFilhosEscopoView(view, indicador, i) - valorParentEscopoView(view, indicador, i); html += `<td class="${gap >= 0 ? "gap-pos" : "gap-neg"}">${fmt(gap, indicador)}</td>`; }
  return html + `</tr>`;
}
function linhaGrupo(id) {
  const fechado = gruposFechados[id]; const icone = fechado ? "▶" : "▼"; const desc = descricaoEntidade(id); const especial = id === "DTTRA" || getEntidadeModelo(id)?.especial;
  return `<tr class="group-row ${especial ? "special-row" : ""}" onclick="toggleGrupo('${id}')"><td colspan="13"><div class="group-line"><span>${icone}</span><span class="group-name">${labelEntidade(id)}</span>${desc ? `<span class="group-tag">${desc}</span>` : ""}<span class="group-divider"></span>${especial ? `<span class="badge special">Especial</span>` : ""}</div></td></tr>`;
}
function linhaMeta(view, id, indicador, label) {
  const oculta = gruposFechados[id] ? "hidden-row" : ""; const disabled = !podeEditarMeta(view, indicador);
  let html = `<tr class="meta ${oculta}"><td>Meta ${label}</td>`;
  for (let i = 0; i < 12; i++) html += `<td>${input(getMetaFinalView(view, id, indicador, i), indicador, disabled, `atualizarMetaEntidade('${view}', '${id}', '${indicador}', ${i}, this.value)`)}</td>`;
  return html + `</tr>`;
}
function linhaRealizado(view, id, indicador, label) {
  const oculta = gruposFechados[id] ? "hidden-row" : ""; const disabled = !podeEditarRealizado(view, indicador);
  let html = `<tr class="realizado ${oculta}"><td>Real ${label}</td>`;
  for (let i = 0; i < 12; i++) html += `<td>${input(valorRealizadoView(view, id, indicador, i), indicador, disabled, `atualizarRealizadoEntidade('${view}', '${id}', '${indicador}', ${i}, this.value)`)}</td>`;
  return html + `</tr>`;
}
function montarTabela(view, titulo) {
  let html = `<div class="card table-card"><div class="card-header"><h2>${titulo} | ${tituloEscopo()}</h2><p>Meta, realizado e GAP mensal. A soma pode ficar diferente do recebido para conferência.</p></div><div class="table-scroll"><table>${tabelaHeader()}<tbody>`;
  html += linhaParent(view, "volume", "Vol") + linhaParent(view, "receita", "Rec") + linhaParent(view, "rpd", "RPD");
  html += linhaGap(view, "volume", "Vol") + linhaGap(view, "receita", "Rec") + linhaGap(view, "rpd", "RPD");
  getFilhosEscopo().forEach(id => { html += linhaGrupo(id) + linhaMeta(view, id, "volume", "Vol") + linhaMeta(view, id, "receita", "Rec") + linhaMeta(view, id, "rpd", "RPD") + linhaRealizado(view, id, "volume", "Vol") + linhaRealizado(view, id, "receita", "Rec") + linhaRealizado(view, id, "rpd", "RPD"); });
  return html + `</tbody></table></div></div>`;
}
function renderTabela() {
  const container = document.getElementById("tabelaContainer"); if (!container || !usuarioLogado) return;
  if (visaoAtual === "comparar") { container.innerHTML = `<div class="compare-grid">${montarTabela("am", "AM")}${montarTabela("ad", "AD")}</div>`; return; }
  const nomes = { am: "AM", ad: "AD", am_ad: "AM + AD" };
  container.innerHTML = montarTabela(visaoAtual, nomes[visaoAtual]);
}
function renderShare() {
  const tbody = document.getElementById("tabelaShare"); if (!tbody || !usuarioLogado) return;
  const view = visaoCalculo(); let html = "";
  getFilhosEscopo().forEach(id => { ["volume", "receita"].forEach(ind => { html += `<tr><td>${labelEntidade(id)}</td><td>${ind === "volume" ? "Volume" : "Receita"}</td>`; for (let i = 0; i < 12; i++) html += `<td>${fmtShare(shareView(view, id, ind, i))}</td>`; html += `</tr>`; }); });
  tbody.innerHTML = html;
}
function renderKpis() {
  if (!usuarioLogado) return;
  const view = visaoCalculo();
  const volume = soma(meses.map((_, i) => valorParentEscopoView(view, "volume", i)));
  const receita = soma(meses.map((_, i) => valorParentEscopoView(view, "receita", i)));
  const rpd = volume > 0 ? receita / volume : 0;
  const nomes = { am: "AM", ad: "AD", am_ad: "AM + AD", comparar: "AM x AD" };
  document.getElementById("kpiVolume").innerText = fmt(volume, "volume");
  document.getElementById("kpiReceita").innerText = fmt(receita, "receita");
  document.getElementById("kpiRpd").innerText = fmt(rpd, "rpd");
  document.getElementById("kpiVisao").innerText = nomes[visaoAtual];
  const escopo = document.getElementById("kpiEscopo");
  if (escopo) escopo.innerText = tituloEscopo();
}

function separarLinhaCsv(linha, separador) {
  const colunas = []; let atual = ""; let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const char = linha[i]; const prox = linha[i + 1];
    if (char === '"' && prox === '"') { atual += '"'; i++; continue; }
    if (char === '"') { dentroAspas = !dentroAspas; continue; }
    if (char === separador && !dentroAspas) { colunas.push(atual.trim()); atual = ""; continue; }
    atual += char;
  }
  colunas.push(atual.trim()); return colunas;
}
function detectarSeparadorCsv(linha) { return [";", ",", "\t"].map(sep => ({ sep, qtd: separarLinhaCsv(linha, sep).length })).sort((a, b) => b.qtd - a.qtd)[0].sep; }
function csvParaObjetos(texto) { const linhas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim()); if (linhas.length < 2) return []; const sep = detectarSeparadorCsv(linhas[0]); const headers = separarLinhaCsv(linhas[0], sep).map(normalizarTexto); return linhas.slice(1).map(linha => { const vals = separarLinhaCsv(linha, sep); const obj = {}; headers.forEach((h, i) => obj[h] = vals[i] || ""); return obj; }); }
function obterCampo(linha, nomes) { for (const nome of nomes) { const chave = normalizarTexto(nome); if (linha[chave] !== undefined) return linha[chave]; } return ""; }
function normalizarVisao(valor) { const t = normalizarTexto(valor).replace(/\s+/g, "_"); if (["am", "aluguel_mensal"].includes(t)) return "am"; if (["ad", "aluguel_diario"].includes(t)) return "ad"; return null; }
function normalizarTipo(valor) { const t = normalizarTexto(valor).replace(/\s+/g, "_"); if (["diretoria", "dir", "input_diretoria"].includes(t)) return "diretoria"; if (["realizado", "real", "base", "historico"].includes(t)) return "realizado"; if (["meta", "meta_ajustada", "ajuste", "retorno", "distribuicao", "distribuicao_meta"].includes(t)) return "meta"; return null; }
function normalizarNivel(valor) { const t = normalizarTexto(valor).replace(/\s+/g, "_"); if (["diretoria", "dir"].includes(t)) return "diretoria"; if (["divisional", "divisao"].includes(t)) return "divisional"; if (["especial", "dttra", "separada"].includes(t)) return "especial"; if (["distrital", "regional"].includes(t)) return "distrital"; if (["carteira", "loja", "unidade"].includes(t)) return "carteira"; return ""; }
function normalizarIndicador(valor) { const t = normalizarTexto(valor); if (["volume", "vol", "contratos"].includes(t)) return "volume"; if (["receita", "rec", "faturamento"].includes(t)) return "receita"; if (["rpd", "diaria", "diaria_media"].includes(t)) return "rpd"; return null; }
function normalizarMes(valor) { const t = normalizarTexto(valor).slice(0, 3); const idx = meses.map(m => normalizarTexto(m).slice(0, 3)).indexOf(t); if (idx >= 0) return idx; const n = parseInt(String(valor).trim(), 10); return n >= 1 && n <= 12 ? n - 1 : -1; }
function identificarEntidadeLinha(linha) {
  const nivel = normalizarNivel(obterCampo(linha, ["nivel", "nível", "level"]));
  const divisional = normalizarCodigo(obterCampo(linha, ["divisional", "divisao", "divisão"]));
  const distrital = normalizarCodigo(obterCampo(linha, ["distrital", "regional"]));
  const carteira = normalizarCodigo(obterCampo(linha, ["carteira", "loja", "unidade"]));
  if (nivel === "diretoria") return { id: "DIRETORIA" };
  if ((nivel === "especial" || divisional === "DTTRA" || distrital === "DTTRA") && !carteira) return { id: "DTTRA" };
  if (carteira) { if (distrital) { const id = carteiraId(distrital, carteira); if (getEntidadeModelo(id)) return { id }; } const possiveis = maps.carteiraParaIds[carteira] || []; if (possiveis.length === 1) return { id: possiveis[0] }; if (possiveis.length > 1) return { erro: `carteira duplicada, informe a distrital: ${carteira}` }; return { erro: `carteira inválida: ${carteira}` }; }
  if (distrital) { if (getEntidadeModelo(distrital)) return { id: distrital }; return { erro: `distrital inválida: ${distrital}` }; }
  if (divisional) { if (getEntidadeModelo(divisional)) return { id: divisional }; return { erro: `divisional inválida: ${divisional}` }; }
  return { erro: "entidade não informada" };
}
function aplicarLinhaImportada(linha, opcoes = {}) {
  const view = normalizarVisao(obterCampo(linha, ["visao", "visão", "base"])); const tipo = normalizarTipo(obterCampo(linha, ["tipo", "classe"])); const indicador = normalizarIndicador(obterCampo(linha, ["indicador", "metrica", "métrica"])); const mes = normalizarMes(obterCampo(linha, ["mes", "mês", "competencia", "competência"])); const valor = parseNumero(obterCampo(linha, ["valor", "vlr", "value"]));
  if (!view || !tipo || !indicador || mes < 0) return { ok: false, motivo: "visão, tipo, indicador ou mês inválido" };
  if (opcoes.somenteMetas && tipo !== "meta") return { ok: false, ignorado: true, motivo: "tipo ignorado" };
  const alvo = identificarEntidadeLinha(linha); if (alvo.erro) return { ok: false, motivo: alvo.erro };
  if (tipo === "diretoria" || alvo.id === "DIRETORIA") { bases[view].entidades.DIRETORIA[indicador][mes] = valor; aplicarTriangulo(bases[view].entidades.DIRETORIA, mes); return { ok: true }; }
  const e = getEntidade(view, alvo.id); if (!e) return { ok: false, motivo: `entidade não encontrada: ${alvo.id}` };
  if (tipo === "realizado") { e[indicador][mes] = valor; aplicarTriangulo(e, mes); return { ok: true }; }
  if (tipo === "meta") { e.metaAjustada[indicador][mes] = valor; return { ok: true }; }
  return { ok: false, motivo: "tipo inválido" };
}
function recalcularMetasImportadas() { ["am", "ad"].forEach(view => { Object.values(bases[view].entidades).forEach(e => { for (let i = 0; i < 12; i++) { if (!indicadores.some(ind => e.metaAjustada[ind][i] !== null)) continue; const obj = { volume: [getMetaFinalView(view, e.id, "volume", i)], receita: [getMetaFinalView(view, e.id, "receita", i)], rpd: [getMetaFinalView(view, e.id, "rpd", i)] }; aplicarTriangulo(obj, 0); e.metaAjustada.volume[i] = obj.volume[0]; e.metaAjustada.receita[i] = obj.receita[0]; e.metaAjustada.rpd[i] = obj.rpd[0]; } }); }); }
function exibirStatus(id, mensagem, sucesso = true) { const el = document.getElementById(id); if (!el) return; el.classList.remove("hidden", "success", "error"); el.classList.add(sucesso ? "success" : "error"); el.innerText = mensagem; }
function lerArquivoComoTexto(arquivo) { return new Promise((resolve, reject) => { const leitor = new FileReader(); leitor.onload = e => resolve(e.target.result); leitor.onerror = () => reject(new Error(`Erro ao ler ${arquivo.name}`)); leitor.readAsText(arquivo, "UTF-8"); }); }
function parseConteudoArquivo(nome, conteudo) { const parsed = nome.toLowerCase().endsWith(".json") ? JSON.parse(conteudo) : csvParaObjetos(conteudo); return Array.isArray(parsed) ? parsed : (parsed.dados || parsed.data || parsed.registros || []); }
async function importarArquivo(event) { const arquivo = event.target.files && event.target.files[0]; if (!arquivo) return; try { const dados = parseConteudoArquivo(arquivo.name, await lerArquivoComoTexto(arquivo)); if (!Array.isArray(dados) || !dados.length) throw new Error("Arquivo sem linhas válidas para importação."); let ok = 0; const erros = []; dados.forEach((linha, idx) => { const r = aplicarLinhaImportada(linha); if (r.ok) ok++; else erros.push(`Linha ${idx + 2}: ${r.motivo}`); }); recalcularMetasImportadas(); render(); const resumo = erros.length ? ` ${erros.slice(0, 4).join(" | ")}${erros.length > 4 ? "..." : ""}` : ""; exibirStatus("importStatus", `${ok} linha(s) importada(s). ${erros.length} linha(s) ignorada(s).${resumo}`, erros.length === 0); } catch (erro) { exibirStatus("importStatus", `Erro na importação: ${erro.message}`, false); } finally { event.target.value = ""; } }
async function importarRetornos(event) {
  const arquivos = Array.from(event.target.files || []);
  if (!arquivos.length) return;
  let ok = 0;
  let ignoradas = 0;
  const erros = [];
  try {
    for (const arquivo of arquivos) {
      const dados = parseConteudoArquivo(arquivo.name, await lerArquivoComoTexto(arquivo));
      dados.forEach((linha, idx) => {
        const r = aplicarLinhaImportada(linha, { somenteMetas: true });
        if (r.ok) ok++;
        else if (r.ignorado) ignoradas++;
        else erros.push(`${arquivo.name} linha ${idx + 2}: ${r.motivo}`);
      });
    }
    resumoUltimaConsolidacao = { arquivos: arquivos.length, linhas: ok, ignoradas, erros: erros.length };
    recalcularMetasImportadas();
    render();
    const resumo = erros.length ? ` ${erros.slice(0, 5).join(" | ")}${erros.length > 5 ? "..." : ""}` : "";
    exibirStatus("consolidacaoStatus", `${arquivos.length} arquivo(s) lido(s). ${ok} meta(s) consolidada(s). ${ignoradas} linha(s) ignorada(s).${resumo}`, erros.length === 0);
  } catch (erro) {
    exibirStatus("consolidacaoStatus", `Erro na consolidação: ${erro.message}`, false);
  } finally {
    event.target.value = "";
  }
}

function baixarArquivo(nome, conteudo, tipo) { const blob = new Blob([conteudo], { type: tipo }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = nome; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); }
function baixarModeloCsv() {
  const conteudo = [
    "visao;tipo;nivel;divisional;distrital;carteira;indicador;mes;valor",
    "am;diretoria;diretoria;;;;volume;Jan;6680",
    "am;diretoria;diretoria;;;;receita;Jan;935200",
    "am;realizado;divisional;DVSDE;;;volume;Jan;16207",
    "am;realizado;divisional;DVSDE;;;receita;Jan;2268980",
    "am;meta;divisional;DVSDE;;;volume;Jan;2500",
    "am;meta;divisional;DVSDE;;;receita;Jan;350000",
    "am;realizado;distrital;DVSDE;RGRIO;;volume;Jan;5000",
    "am;realizado;distrital;DVSDE;RGRIO;;receita;Jan;760000",
    "am;meta;distrital;DVSDE;RGRIO;;volume;Jan;900",
    "am;realizado;carteira;DVSDE;RGRIO;RIO25A;volume;Jan;400",
    "am;realizado;carteira;DVSDE;RGRIO;RIO25A;receita;Jan;62000",
    "am;meta;carteira;DVSDE;RGRIO;RIO25A;volume;Jan;80",
    "am;meta;especial;DTTRA;DTTRA;;volume;Jan;300",
    "am;meta;especial;DTTRA;DTTRA;;receita;Jan;45000",
    "ad;realizado;divisional;DVSME;;;volume;Jan;3780",
    "ad;realizado;divisional;DVSME;;;receita;Jan;529200"
  ].join("\n");
  baixarArquivo("modelo_importacao_hierarquica_simulador.csv", conteudo, "text/csv;charset=utf-8");
}
function camposExportacaoEntidade(e) {
  if (!e) return { nivel: "", divisional: "", distrital: "", carteira: "" };
  if (e.nivel === "especial") return { nivel: "especial", divisional: "DTTRA", distrital: "DTTRA", carteira: "" };
  if (e.especial && e.nivel === "carteira") return { nivel: "carteira", divisional: "DTTRA", distrital: "DTTRA", carteira: e.carteira || "" };
  if (e.nivel === "divisional") return { nivel: "divisional", divisional: e.id, distrital: "", carteira: "" };
  if (e.nivel === "distrital") return { nivel: "distrital", divisional: e.divisional || "", distrital: e.id, carteira: "" };
  if (e.nivel === "carteira") return { nivel: "carteira", divisional: e.divisional || "", distrital: e.distrital || "", carteira: e.carteira || "" };
  return { nivel: e.nivel || "", divisional: e.divisional || "", distrital: e.distrital || "", carteira: e.carteira || "" };
}
function linhaExportada(dataExport, visao, id, escopoExportado, nivelExportado) {
  const e = getEntidadeModelo(id);
  if (!e) return [];
  const campos = camposExportacaoEntidade(e);
  const linhas = [];
  indicadores.forEach(indicador => {
    meses.forEach((mes, idx) => {
      linhas.push({
        data_exportacao: dataExport,
        usuario_matricula: usuarioLogado?.matricula || "",
        usuario_nome: usuarioLogado?.nome || "",
        perfil: usuarioLogado?.perfil || "",
        escopo_exportado: escopoExportado,
        nivel_exportado: nivelExportado,
        visao,
        tipo: "meta",
        nivel: campos.nivel,
        divisional: campos.divisional,
        distrital: campos.distrital,
        carteira: campos.carteira,
        indicador,
        mes,
        valor: getMetaFinalView(visao, id, indicador, idx)
      });
    });
  });
  return linhas;
}
function linhasExportacaoResultado() {
  const dataExport = new Date().toISOString();
  const linhas = [];
  ["am", "ad"].forEach(visao => {
    getFilhosEscopo().forEach(id => {
      linhas.push(...linhaExportada(dataExport, visao, id, escopoAtual.id, escopoAtual.nivel));
    });
  });
  return linhas;
}
function escaparCsv(valor) { if (typeof valor === "number") return String(valor).replace(".", ","); const texto = String(valor ?? ""); if (/[;"\n\r]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`; return texto; }
function objetosParaCsv(linhas) { const headers = ["data_exportacao", "usuario_matricula", "usuario_nome", "perfil", "escopo_exportado", "nivel_exportado", "visao", "tipo", "nivel", "divisional", "distrital", "carteira", "indicador", "mes", "valor"]; return [headers.join(";"), ...linhas.map(l => headers.map(h => escaparCsv(l[h])).join(";"))].join("\n"); }
function nomeArquivoExportacao(ext) { const d = new Date(); const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`; const escopo = String(escopoAtual.id || "DIRETORIA").replace(/[^A-Z0-9]/gi, "_"); return `retorno_${usuarioLogado?.perfil || "usuario"}_${escopo}_${stamp}.${ext}`; }
function exportarResultado(formato) {
  const linhas = linhasExportacaoResultado();
  if (!linhas.length) { exibirStatus("exportStatus", "Não há linhas para exportar neste escopo.", false); return; }
  if (formato === "json") baixarArquivo(nomeArquivoExportacao("json"), JSON.stringify({ dados: linhas }, null, 2), "application/json;charset=utf-8");
  else baixarArquivo(nomeArquivoExportacao("csv"), objetosParaCsv(linhas), "text/csv;charset=utf-8");
  exibirStatus("exportStatus", `${linhas.length} linha(s) exportada(s) em ${formato.toUpperCase()}.`, true);
}
function linhasExportacaoTodos() {
  const ids = Object.keys(bases.am.entidades).filter(id => id !== "DIRETORIA");
  const linhas = [];
  const dataExport = new Date().toISOString();
  ["am", "ad"].forEach(visao => {
    ids.forEach(id => {
      linhas.push(...linhaExportada(dataExport, visao, id, "CONSOLIDADO", "todos"));
    });
  });
  return linhas;
}
function nomeArquivoConsolidado(ext) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `consolidado_metas_${stamp}.${ext}`;
}
function baixarConsolidadoCsv() { exportarConsolidado("csv"); }
function baixarConsolidadoJson() { exportarConsolidado("json"); }
function exportarConsolidado(formato) {
  if (!perfilAdmin()) { exibirStatus("consolidacaoStatus", "A exportação consolidada fica disponível para master/diretor.", false); return; }
  const linhas = linhasExportacaoTodos();
  if (formato === "json") baixarArquivo(nomeArquivoConsolidado("json"), JSON.stringify({ dados: linhas }, null, 2), "application/json;charset=utf-8");
  else baixarArquivo(nomeArquivoConsolidado("csv"), objetosParaCsv(linhas), "text/csv;charset=utf-8");
  exibirStatus("consolidacaoStatus", `${linhas.length} linha(s) consolidadas exportadas em ${formato.toUpperCase()}.`, true);
}


class FallbackLineChart {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.data = config.data || { labels: [], datasets: [] };
    this.options = config.options || {};
    this._points = [];
    this._area = { left: 48, top: 16, right: 20, bottom: 42, width: 1, height: 1 };
    this._min = 0;
    this._max = 1;
    this.scales = { y: { getValueForPixel: pixel => this.pixelToValue(pixel) } };
    this._resizeHandler = () => this.resize();
    window.addEventListener?.("resize", this._resizeHandler);
    this.draw();
  }
  destroy() { if (this._resizeHandler) window.removeEventListener?.("resize", this._resizeHandler); }
  resize() { this.draw(); }
  update() { this.draw(); }
  valueToPixel(valor) {
    const span = this._max - this._min || 1;
    return this._area.top + (this._max - valor) / span * this._area.height;
  }
  pixelToValue(pixel) {
    const span = this._max - this._min || 1;
    const rel = (pixel - this._area.top) / this._area.height;
    return this._max - rel * span;
  }
  pointAt(index, total) {
    if (total <= 1) return this._area.left;
    return this._area.left + index * (this._area.width / (total - 1));
  }
  getElementsAtEventForMode(event) {
    const x = event.offsetX ?? 0;
    const y = event.offsetY ?? 0;
    let best = null;
    this._points.forEach((serie, datasetIndex) => {
      serie.forEach((p, index) => {
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist <= 18 && (!best || dist < best.dist)) best = { datasetIndex, index, dist };
      });
    });
    return best ? [{ datasetIndex: best.datasetIndex, index: best.index }] : [];
  }
  draw() {
    if (!this.canvas || !this.canvas.getContext) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const parentWidth = this.canvas.parentElement?.clientWidth || this.canvas.clientWidth || 900;
    const parentHeight = this.canvas.parentElement?.clientHeight || this.canvas.clientHeight || 320;
    const width = Math.max(640, parentWidth);
    const height = Math.max(280, parentHeight - 40);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const labels = this.data.labels || meses;
    const datasets = this.data.datasets || [];
    const valores = datasets.flatMap(ds => (ds.data || []).map(Number).filter(Number.isFinite));
    const minRaw = valores.length ? Math.min(...valores) : 0;
    const maxRaw = valores.length ? Math.max(...valores) : 1;
    const pad = Math.max(1, (maxRaw - minRaw) * 0.12);
    this._min = Math.max(0, minRaw - pad);
    this._max = maxRaw + pad;
    this._area = { left: 56, top: 18, right: 20, bottom: 58, width: width - 76, height: height - 76 };

    ctx.font = "11px Inter, Segoe UI, Arial, sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e4e7ec";
    ctx.fillStyle = "#667085";
    for (let i = 0; i <= 4; i++) {
      const y = this._area.top + i * (this._area.height / 4);
      const valor = this._max - i * ((this._max - this._min) / 4);
      ctx.beginPath();
      ctx.moveTo(this._area.left, y);
      ctx.lineTo(this._area.left + this._area.width, y);
      ctx.stroke();
      ctx.fillText(fmt(valor, baseGrafico), 6, y + 4);
    }

    labels.forEach((label, idx) => {
      const x = this.pointAt(idx, labels.length);
      ctx.fillText(label, x - 10, height - 18);
    });

    const palette = ["#0f766e", "#3730a3", "#b42318", "#027a48", "#7c2d12", "#155eef", "#9333ea", "#475467"];
    this._points = [];
    datasets.forEach((ds, datasetIndex) => {
      const cor = palette[datasetIndex % palette.length];
      const pts = (ds.data || []).map((valor, idx) => ({ x: this.pointAt(idx, labels.length), y: this.valueToPixel(Number(valor) || 0) }));
      this._points[datasetIndex] = pts;
      ctx.strokeStyle = cor;
      ctx.fillStyle = cor;
      ctx.lineWidth = ds.borderWidth || 2;
      if (ds.borderDash) ctx.setLineDash(ds.borderDash); else ctx.setLineDash([]);
      ctx.beginPath();
      pts.forEach((p, idx) => idx ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, ds.pointRadius || 4, 0, Math.PI * 2); ctx.fill(); });
    });

    let legendX = this._area.left;
    const legendY = height - 38;
    datasets.slice(0, 8).forEach((ds, i) => {
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = "#344054";
      ctx.fillText(ds.label || `Serie ${i + 1}`, legendX + 14, legendY + 1);
      legendX += Math.min(140, 22 + String(ds.label || "").length * 7);
    });
  }
}

function podeEditarGrafico(view, dataset) { if (!dataset || view === "am_ad" || visaoAtual === "comparar" || baseGrafico === bloqueio) return false; if (dataset.tipoSerie === "parent") return podeEditarParent(view, baseGrafico); if (dataset.tipoSerie === "filho") return podeEditarMeta(view, baseGrafico); return false; }
function aplicarValorArrastado(datasetIndex, dataIndex, valor) {
  const view = visaoCalculo(); const dataset = grafico.data.datasets[datasetIndex]; if (!podeEditarGrafico(view, dataset)) return; const valorTratado = Math.max(0, valor || 0);
  if (dataset.tipoSerie === "parent") { bases[view].entidades.DIRETORIA[baseGrafico][dataIndex] = valorTratado; aplicarTriangulo(bases[view].entidades.DIRETORIA, dataIndex); return; }
  const e = getEntidade(view, dataset.entidadeId); if (!e) return; e.metaAjustada[baseGrafico][dataIndex] = valorTratado;
  const obj = { volume: [getMetaFinalView(view, dataset.entidadeId, "volume", dataIndex)], receita: [getMetaFinalView(view, dataset.entidadeId, "receita", dataIndex)], rpd: [getMetaFinalView(view, dataset.entidadeId, "rpd", dataIndex)] };
  aplicarTriangulo(obj, 0); e.metaAjustada.volume[dataIndex] = obj.volume[0]; e.metaAjustada.receita[dataIndex] = obj.receita[0]; e.metaAjustada.rpd[dataIndex] = obj.rpd[0];
}
function seriesGrafico(view) {
  const datasets = [{ label: tituloEscopo(), tipoSerie: "parent", data: meses.map((_, i) => valorParentEscopoView(view, baseGrafico, i)), borderWidth: 4, pointRadius: 5, pointHoverRadius: 8, hitRadius: 12, tension: suavizacaoLinha }];
  getFilhosEscopo().forEach(id => { const especial = id === "DTTRA" || getEntidadeModelo(id)?.especial; datasets.push({ label: labelEntidade(id), tipoSerie: "filho", entidadeId: id, data: meses.map((_, i) => getMetaFinalView(view, id, baseGrafico, i)), borderWidth: especial ? 3 : 2, borderDash: especial ? [6, 4] : undefined, pointRadius: 4, pointHoverRadius: 7, hitRadius: 12, tension: suavizacaoLinha }); });
  return datasets;
}
function atualizarGraficoDuranteArraste() { const view = visaoCalculo(); grafico.data.datasets = seriesGrafico(view); grafico.update("none"); }
function configurarArrasteGrafico() {
  const canvas = document.getElementById("graficoMetas"); if (!canvas || !grafico) return;
  canvas.onmousedown = event => { const view = visaoCalculo(); const pontos = grafico.getElementsAtEventForMode(event, "nearest", { intersect: true }, true); if (!pontos.length) return; const ponto = pontos[0]; const dataset = grafico.data.datasets[ponto.datasetIndex]; if (!podeEditarGrafico(view, dataset)) return; pontoArrastado = { datasetIndex: ponto.datasetIndex, dataIndex: ponto.index }; canvas.classList.add("dragging-chart"); };
  canvas.onmousemove = event => { if (!pontoArrastado || !grafico) return; const valor = grafico.scales.y.getValueForPixel(event.offsetY); aplicarValorArrastado(pontoArrastado.datasetIndex, pontoArrastado.dataIndex, valor); atualizarGraficoDuranteArraste(); };
  const finalizar = () => { if (!pontoArrastado) return; pontoArrastado = null; canvas.classList.remove("dragging-chart"); renderKpis(); renderTabela(); renderShare(); };
  canvas.onmouseup = finalizar; canvas.onmouseleave = finalizar;
}

function renderCascata() {
  const el = document.getElementById("cascataContainer");
  if (!el || !usuarioLogado) return;
  const view = visaoCalculo();
  const filhos = getFilhosEscopo();
  if (!filhos.length) {
    el.innerHTML = `<div class="notice-card">Este escopo não possui destinos abaixo dele.</div>`;
    return;
  }
  let html = `<div class="card table-card"><div class="card-header"><h2>Cascata | ${tituloEscopo()}</h2><p>${descricaoEscopo()}</p></div><div class="table-scroll"><table><thead><tr><th>Nível</th><th>Destino</th><th>Filhos</th><th>Volume Ano</th><th>Receita Ano</th><th>RPD</th><th>GAP Vol.</th><th>GAP Rec.</th></tr></thead><tbody>`;
  filhos.forEach(id => {
    const e = getEntidadeModelo(id);
    const netos = getFilhos(id);
    const volume = soma(meses.map((_, i) => getMetaFinalView(view, id, "volume", i)));
    const receita = soma(meses.map((_, i) => getMetaFinalView(view, id, "receita", i)));
    const rpd = volume > 0 ? receita / volume : 0;
    const volumeNetos = netos.reduce((s, nid) => s + soma(meses.map((_, i) => getMetaFinalView(view, nid, "volume", i))), 0);
    const receitaNetos = netos.reduce((s, nid) => s + soma(meses.map((_, i) => getMetaFinalView(view, nid, "receita", i))), 0);
    const gapVol = netos.length ? volumeNetos - volume : 0;
    const gapRec = netos.length ? receitaNetos - receita : 0;
    html += `<tr><td>${e?.nivel === "especial" ? "especial" : e?.nivel || "-"}</td><td><strong>${labelEntidade(id)}</strong></td><td>${netos.length}</td><td>${fmt(volume, "volume")}</td><td>${fmt(receita, "receita")}</td><td>${fmt(rpd, "rpd")}</td><td class="${gapVol >= 0 ? "gap-pos" : "gap-neg"}">${fmt(gapVol, "volume")}</td><td class="${gapRec >= 0 ? "gap-pos" : "gap-neg"}">${fmt(gapRec, "receita")}</td></tr>`;
  });
  html += `</tbody></table></div></div>`;
  el.innerHTML = html;
}
function renderResumoConsolidacao() {
  const el = document.getElementById("consolidacaoResumo");
  if (!el) return;
  if (!resumoUltimaConsolidacao) {
    el.innerHTML = `<div class="notice-card">Nenhum retorno consolidado nesta sessão.</div>`;
    return;
  }
  el.innerHTML = `<div class="resumo-card"><span>Arquivos</span><strong>${resumoUltimaConsolidacao.arquivos}</strong></div><div class="resumo-card"><span>Metas consolidadas</span><strong>${resumoUltimaConsolidacao.linhas}</strong></div><div class="resumo-card"><span>Erros</span><strong>${resumoUltimaConsolidacao.erros}</strong></div>`;
}

function renderGrafico() {
  const ctx = document.getElementById("graficoMetas");
  if (!ctx || !window.Chart) {
    const status = document.getElementById("importStatus");
    if (status) {
      status.classList.remove("hidden", "success");
      status.classList.add("error");
      status.textContent = "Chart.js não foi carregado. O login e as tabelas funcionam, mas o gráfico exige o arquivo chart.min.js local ou acesso à CDN.";
    }
    return;
  } if (!ctx || !usuarioLogado) return; const view = visaoCalculo(); const datasets = seriesGrafico(view); if (grafico) grafico.destroy(); const ChartEngine = typeof Chart !== "undefined" ? Chart : FallbackLineChart;
  grafico = new ChartEngine(ctx, { type: "line", data: { labels: meses, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, onHover: (event, elements) => { const dataset = elements.length ? grafico.data.datasets[elements[0].datasetIndex] : null; if (event?.native?.target?.style) event.native.target.style.cursor = elements.length && podeEditarGrafico(view, dataset) ? "grab" : "default"; }, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { afterBody: context => { const dataset = context && context.length ? context[0].dataset : null; return podeEditarGrafico(view, dataset) ? "Arraste o ponto para ajustar." : "Edição indisponível nesta linha/visão/perfil."; } } } }, scales: { y: { beginAtZero: false } } } });
  configurarArrasteGrafico();
}
function render() { if (!usuarioLogado) return; aplicarTrianguloTodos(); renderPermissoes(); preencherControlesEscopo(); atualizarCabecalhoEscopo(); renderKpis(); renderTabela(); renderCascata(); renderShare(); renderResumoConsolidacao(); renderGrafico(); }
function iniciar() {
  if (!usuarioLogado) document.body.classList.add("logged-out", "app-locked");
  document.getElementById("loginMatricula")?.focus();
}
Object.assign(window, { fazerLogin, sair, login: fazerLogin, logout: sair, toggleSidebar, ocultarSidebar, mostrarSidebar, mostrarTela, alterarVisao, alterarBaseGrafico, alterarBloqueio, alterarSuavizacao, alternarGraficoExpandido, alterarNivelTrabalho, alterarEscopoTrabalho, toggleGrupo, atualizarDiretoria, atualizarMetaEntidade, atualizarRealizadoEntidade, resetarMetas, importarArquivo, importarRetornos, baixarModeloCsv, exportarResultado, exportarConsolidado, baixarConsolidadoCsv, baixarConsolidadoJson });
iniciar();
