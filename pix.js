'use strict';
/* Pix Copia e Cola (BR Code estático, padrão do Banco Central) */
function pixPayload({ chave, nome, cidade, valor, txid = '***' }) {
  const limpa = (s, n) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, n);
  const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
  // Nome tem limite de 25 letras: abrevia os do meio (MARCELO HENRIQUE R C LEITE -> MARCELO H R C LEITE)
  const ps = limpa(nome, 99).split(/\s+/);
  if (ps.join(' ').length > 25 && ps.length > 2) nome = [ps[0], ...ps.slice(1, -1).map(x => x[0]), ps[ps.length - 1]].join(' ');
  let p = campo('00', '01') + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave)) + campo('52', '0000') + campo('53', '986');
  if (valor > 0) p += campo('54', valor.toFixed(2));
  p += campo('58', 'BR') + campo('59', limpa(nome, 25)) + campo('60', limpa(cidade, 15) || 'BRASIL') + campo('62', campo('05', txid)) + '6304';
  let crc = 0xFFFF;
  for (let i = 0; i < p.length; i++) { crc ^= p.charCodeAt(i) << 8; for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1; crc &= 0xFFFF; }
  return p + crc.toString(16).toUpperCase().padStart(4, '0');
}
// Formato exigido pelo Pix para cada tipo de chave: celular = +55DDDNÚMERO, CPF/CNPJ = só números
function pixChave(k, tipo) {
  k = String(k || '').trim();
  const n = k.replace(/\D/g, '');
  if (tipo === 'cel') return '+' + (n.startsWith('55') && n.length > 11 ? n : '55' + n);
  if (tipo === 'doc') return n;
  return k; // e-mail ou chave aleatória
}
if (typeof module !== 'undefined') module.exports = { pixPayload, pixChave };
