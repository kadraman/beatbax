/**
 * Browser entry for install-time sandboxed validation.
 * Populates the same host namespaces the Desktop renderer uses.
 */
import { installEngineHostBridge } from '../renderer/src/plugins/engine-host-bridge';

installEngineHostBridge();
