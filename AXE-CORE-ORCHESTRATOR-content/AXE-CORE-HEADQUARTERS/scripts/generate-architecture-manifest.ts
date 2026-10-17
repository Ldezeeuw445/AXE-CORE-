import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateArchitectureManifest } from '../src/domain/architecture/generateArchitectureManifest';
import { collectArchitectureFiles, headquartersRoot } from '../src/domain/architecture/readArchitectureFiles';

const hq = headquartersRoot();
const manifest = generateArchitectureManifest(collectArchitectureFiles(hq));
const out = resolve(hq, 'src/domain/architecture/architecture.generated.json');
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${manifest.nodes.length} nodes, ${manifest.edges.length} edges → ${out}`);
