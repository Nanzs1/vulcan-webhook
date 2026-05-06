// api/verify-founding.js
// Vulcan webhook for the Founding Character role.
// Qualifies if the wallet holds any tokenId >= nftsBaseId (104097+).

import { createHandler, isFoundingCharacter } from '../lib/verifier.js';

export default createHandler({
  predicate: isFoundingCharacter,
  label: 'founding-character',
});
