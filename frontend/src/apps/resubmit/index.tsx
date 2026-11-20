import type { MiniAppModule } from '../../platform';
import { ResubmitApp } from './ResubmitApp';

/** P-11: «Reenviar PR» (specs/requisitos/resubmit.md). */
const module: MiniAppModule = { Root: ResubmitApp };
export default module;
