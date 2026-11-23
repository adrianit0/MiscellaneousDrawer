import type { MiniAppModule } from '../../platform';
import { InventoryApp } from './InventoryApp';

/** P-11: «Inventario» (specs/requisitos/inventory.md). */
const module: MiniAppModule = { Root: InventoryApp };
export default module;
