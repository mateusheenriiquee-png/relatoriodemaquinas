const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveSupportDocId } = require('../api/src/services/suportes-firestore');

test('resolveSupportDocId cria um id determinístico para o mesmo suporte', () => {
  const first = resolveSupportDocId({
    protocolo: 'ABC-123',
    cpfCnpj: '123.456.789-00',
    dataAbertura: '2026-08-07T10:00:00.000Z'
  });

  const second = resolveSupportDocId({
    protocolo: 'ABC-123',
    cpfCnpj: '123.456.789-00',
    dataAbertura: '2026-08-07T10:00:00.000Z'
  });

  assert.equal(first, second);
  assert.match(first, /^support_/);
});

test('resolveSupportDocId respeita um id explícito', () => {
  const id = resolveSupportDocId({ id: 'custom-id', protocolo: 'ABC-123' });
  assert.equal(id, 'custom-id');
});
