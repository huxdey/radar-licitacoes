// Roda o radar pelo terminal: npm run radar  (ou: npm run radar -- completo)
import { runRadar } from '../lib/radar';

const modo = process.argv[2] === 'completo' ? 'completo' : 'diario';
runRadar(modo)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.status === 'falhou' ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
