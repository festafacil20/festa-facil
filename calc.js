'use strict';
/* ===== Calculadora rápida de custo por unidade (tela Início) =====
   Ex.: caixa com 100 pincéis + frete, parcelada no Mercado Pago → quanto sai cada pincel.
   Os juros por nº de parcelas ficam guardados em db.config.jurosMP ({ "3": 9.5, ... }) para vir preenchidos. */
const CK = 'festafacil.calc';
function calcRapida(host) {
  if (!host) return;
  let v; try { v = JSON.parse(localStorage.getItem(CK)) || {}; } catch { v = {}; }
  const juros = () => db.config.jurosMP || {};
  const un = v.un || 'un', rotUn = { un: 'unidade', ml: 'ml', g: 'g', m: 'metro' };
  host.innerHTML = `<details class="card calc" ${v.aberta ? 'open' : ''}><summary><b>🧮 Calculadora de custo por unidade</b><small>Vale a pena comprar? Veja quanto sai cada unidade.</small></summary>
    <div class="par" style="margin-top:10px"><div><label style="margin-top:0">Preço (R$)</label><input id="cxp" inputmode="decimal" placeholder="Ex.: 89,90" value="${esc(v.p || '')}"></div>
      <div><label style="margin-top:0">Vem quantos?</label><div class="par"><input id="cxq" inputmode="decimal" placeholder="100" value="${esc(v.q || '')}"><select id="cxu" style="max-width:74px">${Object.keys(rotUn).map(k => `<option value="${k}" ${k === un ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div></div>
    <label>Frete (R$, se houver)</label><input id="cxf" inputmode="decimal" placeholder="0" value="${esc(v.f || '')}">
    <label>Pagamento</label><div class="tabs" style="margin:0"><button type="button" data-cx="1" class="${(v.n || 1) == 1 ? 'on' : ''}">À vista</button><button type="button" data-cx="n" class="${(v.n || 1) > 1 ? 'on' : ''}">Parcelado</button></div>
    <div id="cxparc" ${(v.n || 1) > 1 ? '' : 'hidden'}>
      <div class="par"><div><label>Parcelas</label><select id="cxn">${Array.from({ length: 11 }, (_, i) => i + 2).map(n => `<option ${n == (v.n || 3) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label>Juros total (%)</label><input id="cxj" inputmode="decimal" placeholder="0"></div></div>
      <label>ou valor de cada parcela (R$)</label><input id="cxv" inputmode="decimal" placeholder="Se souber, é mais exato">
      <div class="s" style="color:var(--mut);margin-top:4px">Use o que aparece no Mercado Pago na hora de pagar. Os juros de cada nº de parcelas ficam guardados.</div>
    </div>
    <label>Comparar com item do estoque (opcional)</label><select id="cxc"><option value="">Não comparar</option>${db.produtos.filter(p => custoUn(p) > 0).sort((a, b) => a.nome.localeCompare(b.nome)).map(p => `<option value="${p.id}" ${p.id === v.c ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
    <div id="cxres"></div>
    <button class="btn sec sm" id="cxlimpa" type="button" style="margin-top:8px">Limpar</button></details>`;
  const el = s => host.querySelector(s);
  let parc = (v.n || 1) > 1;
  const jurosDe = n => juros()[n] != null ? String(juros()[n]).replace('.', ',') : '';
  el('#cxj').value = jurosDe(el('#cxn').value);
  const calc = () => {
    const p = num(el('#cxp').value), q = num(el('#cxq').value), f = num(el('#cxf').value), u = el('#cxu').value, n = parc ? +el('#cxn').value : 1;
    const vParc = num(el('#cxv').value), j = num(el('#cxj').value);
    const avista = p + f, total = !parc ? avista : vParc > 0 ? vParc * n : avista * (1 + j / 100);
    try { localStorage.setItem(CK, JSON.stringify({ p: el('#cxp').value, q: el('#cxq').value, f: el('#cxf').value, un: u, n, c: el('#cxc').value, aberta: host.querySelector('details').open })); } catch {}
    if (!p || !q) { el('#cxres').innerHTML = ''; return; }
    const cada = total / q, cadaAvista = avista / q, rot = rotUn[u];
    // "por 100" ajuda a comparar itens vendidos em ml/g (ex.: tinta de 250 ml x 1 L)
    const extra = u === 'ml' || u === 'g' ? ` · ${brl(cada * 100)} por 100 ${u}` : '';
    let cmp = '';
    const pc = by(db.produtos, el('#cxc').value);
    if (pc) {
      const baseK = (UNS[u] || UNS.un).k, atual = custoUn(pc) * baseK; // custo atual na mesma unidade da calculadora
      if (baseDe(u) !== baseDe(pc.un)) cmp = `<div class="aviso">A unidade escolhida (${u}) não combina com ${esc(pc.nome)} (${pc.un}).</div>`;
      else { const dif = (cada - atual) / atual * 100; cmp = `<div class="aviso ${dif > 0 ? 'bad' : ''}" style="${dif <= 0 ? 'background:#e7f7ec;border-color:var(--ok)' : ''}">Hoje você paga <b>${brl(atual)}</b> por ${rot} de ${esc(pc.nome)}. Esta oferta sai <b>${Math.abs(dif).toFixed(0)}% ${dif > 0 ? 'mais cara' : 'mais barata'}</b>.</div>`; }
    }
    el('#cxres').innerHTML = `<div class="calcres"><small>Custo por ${rot}</small><b>${cada < 1 ? cada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 3, maximumFractionDigits: 3 }) : brl(cada)}</b><small>${extra.replace(' · ', '')}</small></div>
      <div class="row"><span>Total pago</span><b>${brl(total)}</b></div>
      ${parc ? `<div class="row"><span>${n}x de</span><b>${brl(total / n)}</b></div><div class="row"><span>Juros pagos</span><b class="${total > avista ? 'neg' : ''}">${brl(total - avista)}</b></div><div class="row"><span>À vista sairia por ${rot}</span><b>${brl(cadaAvista)}</b></div>` : ''}
      ${f ? `<div class="row"><span>Frete por ${rot}</span><b>${brl(f / q)}</b></div>` : ''}${cmp}`;
  };
  host.addEventListener('input', calc); host.addEventListener('change', calc);
  host.querySelector('details').addEventListener('toggle', calc);
  el('#cxn').addEventListener('change', () => { el('#cxj').value = jurosDe(el('#cxn').value); el('#cxv').value = ''; calc(); });
  // guarda os juros usados para esse nº de parcelas (vale para os próximos cálculos, em qualquer aparelho)
  el('#cxj').addEventListener('change', () => { const n = el('#cxn').value, j = num(el('#cxj').value); db.config.jurosMP = { ...juros(), [n]: j }; save(); });
  host.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => { parc = b.dataset.cx === 'n'; host.querySelectorAll('[data-cx]').forEach(x => x.classList.toggle('on', x === b)); el('#cxparc').hidden = !parc; calc(); });
  el('#cxlimpa').onclick = () => { ['#cxp', '#cxq', '#cxf', '#cxv'].forEach(s => el(s).value = ''); el('#cxc').value = ''; calc(); };
  calc();
}
