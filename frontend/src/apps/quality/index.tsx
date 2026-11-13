import type { MiniAppModule } from '../../platform';
import { QualityApp } from './QualityApp';

/** P-11: «Calidad del dato» (specs/requisitos/quality.md). */
const module: MiniAppModule = { Root: QualityApp };
export default module;
