# WhatsApp Provider Adapters

## Overview

All WhatsApp communication goes through the `WhatsAppProvider` interface defined in `packages/shared/src/whatsapp.ts`. The active adapter is registered once in `sessions.ts` via `setAdapter()`. BotOrchestrator (`intake.ts`, `driver.ts`) never imports a concrete adapter — it only calls the interface. This means swapping providers requires **zero changes** to orchestration code.

---

## Supported Providers

| Name             | Class                | Provider value    | File              |
|------------------|----------------------|-------------------|-------------------|
| Evolution Go     | `EvolutionGoAdapter` | `evolution-go`    | `evolution-go.ts` |
| WAHA             | `WahaAdapter`        | `waha`            | `waha.ts`         |
| Z-API            | `ZApiAdapter`        | `z-api`           | `zapi.ts`         |
| Meta Cloud API   | `MetaCloudApiAdapter`| `meta-cloud-api`  | `meta-cloud.ts`   |

---

## How to Switch Provider

1. **Import the target adapter** in `apps/api/src/lib/whatsapp/sessions.ts`:
   ```ts
   import { WahaAdapter } from "./waha";
   ```

2. **Register the adapter** by calling `setAdapter` at startup (replace the existing `EvolutionGoAdapter` call):
   ```ts
   setAdapter(new WahaAdapter({
     apiUrl: process.env.WAHA_API_URL!,
     apiKey: process.env.WAHA_API_KEY!,
   }));
   ```

3. **Update the `provider` column** in your WhatsApp sessions data to the new provider value string (e.g. `'waha'`). This field is informational — it identifies the adapter that manages each session.

That's it. No changes to `intake.ts`, `driver.ts`, or any BotOrchestrator module are needed.

---

## Provider Config Reference

### Evolution Go (`evolution-go`)
| Env var                  | Description                      |
|--------------------------|----------------------------------|
| `EVOLUTION_API_URL`      | Base URL of the Evolution Go API |
| `EVOLUTION_API_KEY`      | API key for authentication       |

### WAHA (`waha`)
| Env var         | Description                  |
|-----------------|------------------------------|
| `WAHA_API_URL`  | Base URL of the WAHA API     |
| `WAHA_API_KEY`  | API key for authentication   |

### Z-API (`z-api`)
| Env var                | Description                         |
|------------------------|-------------------------------------|
| `ZAPI_INSTANCE_ID`     | Z-API instance identifier           |
| `ZAPI_TOKEN`           | Instance token                      |
| `ZAPI_CLIENT_TOKEN`    | Account-level client token (header) |

### Meta Cloud API (`meta-cloud-api`)
| Env var                    | Description                              |
|----------------------------|------------------------------------------|
| `META_PHONE_NUMBER_ID`     | Phone Number ID from Meta dashboard      |
| `META_ACCESS_TOKEN`        | Permanent / system user access token     |
| `META_WABA_ID`             | WhatsApp Business Account ID             |

---

## Contract

The `WhatsAppProvider` interface defines four methods:

```ts
connect(instanceName: string): Promise<{ qrCode: string | null }>;
disconnect(instanceName: string): Promise<void>;
getStatus(instanceName: string): Promise<{ status: "connected" | "disconnected" | "connecting" }>;
sendText(instanceName: string, to: string, text: string): Promise<void>;
```

**BotOrchestrator is fully decoupled from the adapter layer.** It calls only these four methods via the registered adapter. Switching the underlying WhatsApp provider is an infrastructure concern — orchestration logic, conversation state, and message routing are unaffected.

The stub adapters (`waha.ts`, `zapi.ts`, `meta-cloud.ts`) throw `Error('not implemented …')` on all methods. They exist to document the swap contract and show the required constructor config for each provider.
