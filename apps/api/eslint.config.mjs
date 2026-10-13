import { globalIgnores } from 'eslint/config';
import base from '../../eslint.config.mjs';

export default [...base, globalIgnores(['src/generated/**'])];
