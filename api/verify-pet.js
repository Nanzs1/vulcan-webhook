// api/verify-pet.js
// Vulcan webhook for the Pet role.
// Qualifies if the wallet holds any tokenId in [eggsBaseId, nftsBaseId)
// i.e. 100001 → 104096 (the 4,096 pets, formerly known as eggs).

import { createHandler, isPet } from '../lib/verifier.js';

export default createHandler({
  predicate: isPet,
  label: 'pet',
});
