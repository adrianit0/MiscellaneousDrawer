import type { MiniAppModule } from '../../platform';
import { DatabaseApp } from './DatabaseApp';

/** P-11: «Base de datos» (specs/requisitos/database.md). */
const module: MiniAppModule = { Root: DatabaseApp };
export default module;
