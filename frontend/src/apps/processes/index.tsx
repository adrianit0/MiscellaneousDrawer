import type { MiniAppModule } from '../../platform';
import { ProcessesApp } from './ProcessesApp';

/** P-11: «Cerrar procesos» (specs/requisitos/processes.md). */
const module: MiniAppModule = { Root: ProcessesApp };
export default module;
