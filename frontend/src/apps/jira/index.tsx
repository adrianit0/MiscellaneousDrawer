import type { MiniAppModule } from '../../platform';
import { JiraApp } from './JiraApp';

/** P-11: «Tableros Jira» (specs/requisitos/jira.md). */
const module: MiniAppModule = { Root: JiraApp };
export default module;
