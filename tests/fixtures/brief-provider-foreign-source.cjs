// Test provider for the shallow-brief path: it drafts like the stub, then claims that the first point is
// "sourced" by a source the brief never gave. harness/brief/brief.js must not trust that: the claim has to come
// out unverified and listed in lesson.brief.unverified_claims.
'use strict';
const stub = require('../../harness/brief/stub-provider.js');

module.exports = {
  id: 'test-foreign-source',
  calls: 0,
  draft(brief) {
    module.exports.calls++;
    const out = stub.draft(brief);
    out.lesson.claims[0].status = 'sourced';
    out.lesson.claims[0].source_ids = ['s-not-in-the-brief'];
    out.assumptions = ['Provider de teste: atribui o primeiro ponto a uma fonte que o pedido não deu.'];
    return out;
  }
};
