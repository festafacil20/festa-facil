'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FAIXAS = [10, 15, 20, 25];

function decode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))));
}
let d;
try { d = window.__D || decode(location.hash.replace(/^#d=/, '')); if (!d || !Array.isArray(d.i)) throw 0; } catch { d = null; }

if (!d) {
  $('#lista').innerHTML = '<div class="card vazio">Link inválido. Peça um novo cardápio à empresa.</div>';
  $('.bar').hidden = true;
} else {
  $('#tt').textContent = d.n || 'Monte sua festa';
  document.title = 'Cardápio - ' + (d.n || '');
  const grupo = (t, titulo) => {
    const its = d.i.map((x, idx) => ({ ...x, idx })).filter(x => x.t === t);
    return its.length ? `<div class="card"><h3>${titulo}</h3>${its.map(x => `<div class="row" style="display:block" data-box="${x.idx}"><div class="pitem">${x.g ? `<img src="${x.g}" alt="">` : ''}<div class="info">
      <label class="ck"><input type="checkbox" data-i="${x.idx}">${esc(x.n)}</label>
      ${x.d ? `<div class="d">${esc(x.d)}</div>` : ''}
      ${t === 'b' ? `<b>${brl(x.v)}</b> <small style="color:var(--mut)">/ diária</small>` : `<div class="qcr" hidden><label style="margin-top:4px">Quantas crianças?</label><select data-q="${x.idx}"><option value="">Escolha a quantidade</option>${FAIXAS.map((f, k) => `<option value="${k}">Até ${f} crianças · ${brl(x.f[k])}</option>`).join('')}<option value="c">Mais de 25 crianças · a combinar</option></select></div><small style="color:var(--mut)">a partir de ${brl(Math.min(...x.f))}</small>`}
    </div></div></div>`).join('')}</div>` : '';
  };
  $('#lista').innerHTML = `<div class="card"><label style="margin-top:0">Seu nome</label><input id="nome" placeholder="Nome"><label>Data da festa</label><input type="date" id="data"></div>` + grupo('b', '🎪 Brinquedos') + grupo('o', '🎨 Oficinas');

  const sel = () => [...document.querySelectorAll('[data-i]:checked')].map(c => {
    const x = d.i[+c.dataset.i];
    if (x.t === 'b') return { n: x.n, v: x.v, txt: `${x.n} - ${brl(x.v)}` };
    const v = document.querySelector(`[data-q="${c.dataset.i}"]`).value;
    if (!v) return { n: x.n, v: 0, incompleto: true, txt: x.n };
    if (v === 'c') return { n: x.n, v: 0, combinar: true, txt: `${x.n} - mais de 25 crianças - valor a combinar` };
    const k = +v;
    return { n: x.n, v: x.f[k], txt: `${x.n} - até ${FAIXAS[k]} crianças - ${brl(x.f[k])}` };
  });
  const atual = () => {
    document.querySelectorAll('[data-box]').forEach(b => {
      const c = b.querySelector('[data-i]'), q = b.querySelector('.qcr'); if (!q) return;
      q.hidden = !c.checked;
    });
    const s = sel(), comb = s.some(x => x.combinar);
    $('#tot').textContent = 'Total: ' + brl(s.reduce((a, x) => a + x.v, 0)) + (comb ? ' + a combinar' : '');
  };
  $('#lista').addEventListener('input', atual);
  $('#lista').addEventListener('change', atual);
  $('#enviar').onclick = () => {
    const s = sel(); if (!s.length) return alert('Marque ao menos um item.');
    if (s.some(x => x.incompleto)) return alert('Escolha a quantidade de crianças em cada oficina marcada.');
    const nome = $('#nome').value.trim(), data = $('#data').value;
    const total = s.reduce((a, x) => a + x.v, 0), comb = s.some(x => x.combinar);
    const txt = `Olá! Gostaria de um orçamento${nome ? ' (' + nome + ')' : ''}${data ? ' para o dia ' + data.split('-').reverse().join('/') : ''}:\n\n${s.map(x => '• ' + x.txt).join('\n')}\n\nTotal: ${brl(total)}${comb ? ' + itens a combinar' : ''}`;
    let n = String(d.w || '').replace(/\D/g, ''); if (n && n.length <= 11) n = '55' + n;
    location.href = `https://wa.me/${n}?text=${encodeURIComponent(txt)}`;
  };
}
