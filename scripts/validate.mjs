// npm run validate — fails if the data model has broken references.
import { loadData } from './load-data.mjs';
import { validate } from '../src/model/validate.js';

const { errors, warnings } = validate(loadData());
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
