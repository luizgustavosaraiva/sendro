import { describe, expect, it } from "vitest";
import { renderDashboardPage } from "../src/app/(app)/dashboard/page";

describe("dashboard dispatch queue SSR", () => {
  it("renders active queue and waiting queue diagnostics separately", () => {
    const html = renderDashboardPage({
      user: { name: "Ops Company", email: "ops@sendro.test", role: "company" },
      profile: { id: "550e8400-e29b-41d4-a716-446655440000", name: "Ops Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bondsState: "empty",
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", error: "Somente lojistas podem criar entregas pelo dashboard.", deliveries: [] },
      companyDeliveries: {
        state: "loaded",
        deliveries: [],
        transitionFeedback: undefined,
        activeQueue: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440100",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            retailerId: "550e8400-e29b-41d4-a716-446655440001",
            driverId: null,
            externalReference: "order-active",
            status: "offered",
            pickupAddress: "Rua A",
            dropoffAddress: "Rua B",
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            timeline: [
              {
                eventId: "550e8400-e29b-41d4-a716-446655440101",
                deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                status: "offered",
                actorType: "system",
                actorId: null,
                actorLabel: "dispatch-engine",
                sequence: 1,
                metadata: {},
                createdAt: "2026-01-01T00:01:00.000Z"
              }
            ],
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440110",
              deliveryId: "550e8400-e29b-41d4-a716-446655440100",
              companyId: "550e8400-e29b-41d4-a716-446655440000",
              phase: "offered",
              timeoutSeconds: 120,
              activeAttemptNumber: 1,
              activeAttemptId: "550e8400-e29b-41d4-a716-446655440111",
              offeredDriverId: null,
              offeredDriverName: null,
              offeredAt: "2026-01-01T00:01:00.000Z",
              deadlineAt: "2026-01-01T00:03:00.000Z",
              waitingReason: null,
              waitingSince: null,
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [],
              attempts: [
                {
                  attemptId: "550e8400-e29b-41d4-a716-446655440111",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                  companyId: "550e8400-e29b-41d4-a716-446655440000",
                  attemptNumber: 1,
                  driverId: null,
                  offerStatus: "pending",
                  expiresAt: "2026-01-01T00:03:00.000Z",
                  resolvedAt: null,
                  resolvedByActorType: null,
                  resolvedByActorId: null,
                  resolutionReason: null,
                  candidateSnapshot: null,
                  createdAt: "2026-01-01T00:01:00.000Z",
                  updatedAt: "2026-01-01T00:01:00.000Z"
                }
              ],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:01:00.000Z"
            }
          }
        ],
        waitingQueue: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440120",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            retailerId: "550e8400-e29b-41d4-a716-446655440001",
            driverId: null,
            externalReference: "order-waiting",
            status: "queued",
            pickupAddress: "Rua C",
            dropoffAddress: "Rua D",
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:04:00.000Z",
            timeline: [
              {
                eventId: "550e8400-e29b-41d4-a716-446655440121",
                deliveryId: "550e8400-e29b-41d4-a716-446655440120",
                status: "queued",
                actorType: "system",
                actorId: null,
                actorLabel: "dispatch-engine",
                sequence: 1,
                metadata: {},
                createdAt: "2026-01-01T00:04:00.000Z"
              }
            ],
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440122",
              deliveryId: "550e8400-e29b-41d4-a716-446655440120",
              companyId: "550e8400-e29b-41d4-a716-446655440000",
              phase: "waiting",
              timeoutSeconds: 120,
              activeAttemptNumber: 2,
              activeAttemptId: null,
              offeredDriverId: null,
              offeredDriverName: null,
              offeredAt: null,
              deadlineAt: null,
              waitingReason: "max_private_attempts_reached",
              waitingSince: "2026-01-01T00:04:00.000Z",
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [],
              attempts: [
                {
                  attemptId: "550e8400-e29b-41d4-a716-446655440123",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440120",
                  companyId: "550e8400-e29b-41d4-a716-446655440000",
                  attemptNumber: 2,
                  driverId: null,
                  offerStatus: "expired",
                  expiresAt: "2026-01-01T00:03:30.000Z",
                  resolvedAt: "2026-01-01T00:04:00.000Z",
                  resolvedByActorType: "system",
                  resolvedByActorId: null,
                  resolutionReason: "driver_offer_timeout",
                  candidateSnapshot: null,
                  createdAt: "2026-01-01T00:02:00.000Z",
                  updatedAt: "2026-01-01T00:04:00.000Z"
                }
              ],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:04:00.000Z"
            }
          }
        ]
      },
      driverDeliveries: {
        state: "not-driver",
        offerState: "not-driver",
        strikeState: "not-driver",
        error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard.",
        deliveries: [],
        activeOffer: null,
        strikeSummary: {
          total: 0,
          lastStrike: null,
          activeConsequence: null,
          bondStatus: null
        }
      }
    });

    expect(html).toContain('data-testid="dispatch-active-list"');
    expect(html).toContain('data-testid="dispatch-waiting-list"');
    expect(html).toContain('order-active');
    expect(html).toContain('order-waiting');
    expect(html).toContain('data-testid="dispatch-active-attempt">1');
    expect(html).toContain('data-testid="dispatch-last-attempt">2:expired');
    expect(html).toContain("Máximo de tentativas privadas atingido");
  });

  it("renders proof-of-delivery details and completion actions without collapsing SSR state", () => {
    const html = renderDashboardPage({
      user: { name: "Ops Driver", email: "driver@sendro.test", role: "driver" },
      profile: { id: "550e8400-e29b-41d4-a716-446655440000", name: "Ops Driver", stripeCustomerId: null },
      diagnostics: { role: "driver", profileCreated: true, stripeStage: "created" },
      bondsState: "not-company",
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      invitations: { state: "not-company", invitations: [], error: "Somente contas empresa podem gerar e listar convites." },
      retailerDeliveries: { state: "not-retailer", error: "Somente lojistas podem criar entregas pelo dashboard.", deliveries: [] },
      companyDeliveries: {
        state: "not-company",
        error: "Somente contas empresa visualizam a fila operacional de entregas.",
        deliveries: [],
        activeQueue: [],
        waitingQueue: []
      },
      driverDeliveries: {
        state: "loaded",
        offerState: "empty",
        strikeState: "empty",
        deliveries: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440200",
            companyId: "550e8400-e29b-41d4-a716-446655440201",
            retailerId: "550e8400-e29b-41d4-a716-446655440202",
            driverId: "550e8400-e29b-41d4-a716-446655440203",
            externalReference: "order-proof",
            status: "delivered",
            pickupAddress: "Rua E",
            dropoffAddress: "Rua F",
            metadata: {},
            proof: {
              deliveredAt: "2026-01-01T00:05:00.000Z",
              note: "Recebido pelo cliente.",
              photoUrl: "https://cdn.sendro.test/proofs/order-proof.jpg",
              submittedByActorType: "driver",
              submittedByActorId: "user-driver",
              policy: { requireNote: true, requirePhoto: true }
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:05:00.000Z",
            timeline: [],
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440204",
              deliveryId: "550e8400-e29b-41d4-a716-446655440200",
              companyId: "550e8400-e29b-41d4-a716-446655440201",
              phase: "completed",
              timeoutSeconds: 120,
              activeAttemptNumber: 1,
              activeAttemptId: null,
              offeredDriverId: "550e8400-e29b-41d4-a716-446655440203",
              offeredDriverName: "Ops Driver",
              offeredAt: "2026-01-01T00:01:00.000Z",
              deadlineAt: null,
              waitingReason: null,
              waitingSince: null,
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [],
              attempts: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:05:00.000Z"
            }
          },
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440210",
            companyId: "550e8400-e29b-41d4-a716-446655440201",
            retailerId: "550e8400-e29b-41d4-a716-446655440202",
            driverId: "550e8400-e29b-41d4-a716-446655440203",
            externalReference: "order-in-transit",
            status: "in_transit",
            pickupAddress: "Rua G",
            dropoffAddress: "Rua H",
            metadata: {},
            proof: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:04:00.000Z",
            timeline: [],
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440211",
              deliveryId: "550e8400-e29b-41d4-a716-446655440210",
              companyId: "550e8400-e29b-41d4-a716-446655440201",
              phase: "completed",
              timeoutSeconds: 120,
              activeAttemptNumber: 1,
              activeAttemptId: null,
              offeredDriverId: "550e8400-e29b-41d4-a716-446655440203",
              offeredDriverName: "Ops Driver",
              offeredAt: "2026-01-01T00:01:00.000Z",
              deadlineAt: null,
              waitingReason: null,
              waitingSince: null,
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [],
              attempts: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:04:00.000Z"
            }
          }
        ],
        activeOffer: null,
        strikeSummary: {
          total: 0,
          lastStrike: null,
          activeConsequence: null,
          bondStatus: null
        }
      }
    });

    expect(html).toContain('data-testid="delivery-proof"');
    expect(html).toContain('Recebido pelo cliente.');
    expect(html).toContain('https://cdn.sendro.test/proofs/order-proof.jpg');
    expect(html).toContain('data-testid="delivery-proof-policy">note=true photo=true');
    expect(html).toContain('data-testid="delivery-complete-form"');
    expect(html).toContain('data-testid="delivery-complete-submit"');
  });

  it("renders company completion feedback when proof-of-delivery closes a lifecycle", () => {
    const html = renderDashboardPage({
      user: { name: "Ops Company", email: "ops@sendro.test", role: "company" },
      profile: { id: "550e8400-e29b-41d4-a716-446655440000", name: "Ops Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bondsState: "empty",
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", error: "Somente lojistas podem criar entregas pelo dashboard.", deliveries: [] },
      companyDeliveries: {
        state: "loaded",
        deliveries: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440300",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            retailerId: "550e8400-e29b-41d4-a716-446655440301",
            driverId: "550e8400-e29b-41d4-a716-446655440302",
            externalReference: "order-company-proof",
            status: "delivered",
            pickupAddress: "Rua I",
            dropoffAddress: "Rua J",
            metadata: {},
            proof: {
              deliveredAt: "2026-01-01T00:10:00.000Z",
              note: "Recebido na portaria principal.",
              photoUrl: "https://cdn.sendro.test/proofs/order-company-proof.jpg",
              submittedByActorType: "driver",
              submittedByActorId: "user-driver-company",
              policy: { requireNote: true, requirePhoto: true }
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:10:00.000Z",
            timeline: [],
            dispatch: null
          }
        ],
        activeQueue: [],
        waitingQueue: [],
        completionFeedback: {
          message: "Entrega concluída com prova registrada.",
          deliveryId: "550e8400-e29b-41d4-a716-446655440300",
          status: "delivered"
        }
      },
      driverDeliveries: {
        state: "not-driver",
        offerState: "not-driver",
        strikeState: "not-driver",
        error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard.",
        deliveries: [],
        activeOffer: null,
        strikeSummary: {
          total: 0,
          lastStrike: null,
          activeConsequence: null,
          bondStatus: null
        }
      }
    });

    expect(html).toContain('data-testid="company-delivery-completion-feedback"');
    expect(html).toContain('data-testid="company-delivery-completion-message"');
    expect(html).toContain('Entrega concluída com prova registrada.');
    expect(html).toContain('data-testid="delivery-proof"');
    expect(html).toContain('data-testid="delivery-proof-policy">note=true photo=true');
  });

  it("keeps queue and waiting visible when summary/drivers blocks fail", () => {
    const html = renderDashboardPage({
      user: { name: "Ops Company", email: "ops@sendro.test", role: "company" },
      profile: { name: "Ops Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bondsState: "empty",
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      summary: null,
      summaryState: "error",
      summaryError: "summary block failed",
      driversOperational: [],
      driversState: "error",
      driversError: "drivers block failed",
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", error: "Somente lojistas podem criar entregas pelo dashboard.", deliveries: [] },
      companyDeliveries: {
        state: "loaded",
        deliveries: [],
        activeQueue: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655441000",
            companyId: "550e8400-e29b-41d4-a716-446655441001",
            retailerId: "550e8400-e29b-41d4-a716-446655441002",
            driverId: null,
            externalReference: "queue-still-visible",
            status: "offered",
            pickupAddress: null,
            dropoffAddress: null,
            metadata: {},
            proof: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            timeline: [],
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655441003",
              deliveryId: "550e8400-e29b-41d4-a716-446655441000",
              companyId: "550e8400-e29b-41d4-a716-446655441001",
              phase: "offered",
              timeoutSeconds: 120,
              activeAttemptNumber: 1,
              activeAttemptId: "550e8400-e29b-41d4-a716-446655441004",
              offeredDriverId: null,
              offeredDriverName: null,
              offeredAt: null,
              deadlineAt: null,
              waitingReason: null,
              waitingSince: null,
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [],
              attempts: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }
          }
        ],
        waitingQueue: []
      },
      driverDeliveries: {
        state: "not-driver",
        offerState: "not-driver",
        strikeState: "not-driver",
        error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard.",
        deliveries: [],
        activeOffer: null,
        strikeSummary: { total: 0, lastStrike: null, activeConsequence: null, bondStatus: null }
      }
    });

    expect(html).toContain('data-testid="operations-summary-error"');
    expect(html).toContain('data-testid="drivers-operational-error"');
    expect(html).toContain('data-testid="dispatch-active-list"');
    expect(html).toContain('queue-still-visible');
  });

  it("renders explicit empty and error states without collapsing them", () => {
    const html = renderDashboardPage({
      user: { name: "Ops Company", email: "ops@sendro.test", role: "company" },
      profile: { name: "Ops Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bondsState: "empty",
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", error: "Somente lojistas podem criar entregas pelo dashboard.", deliveries: [] },
      companyDeliveries: {
        state: "error",
        error: "A sessão foi resolvida, mas a fila de entregas da empresa não pôde ser carregada.",
        queueError: "dispatch_queue_unavailable",
        waitingError: "waiting_queue_unavailable",
        deliveries: [],
        activeQueue: [],
        waitingQueue: []
      },
      driverDeliveries: {
        state: "not-driver",
        offerState: "not-driver",
        strikeState: "not-driver",
        error: "Somente entregadores visualizam ofertas e strikes próprios no dashboard.",
        deliveries: [],
        activeOffer: null,
        strikeSummary: {
          total: 0,
          lastStrike: null,
          activeConsequence: null,
          bondStatus: null
        }
      }
    });

    expect(html).toContain('data-testid="company-deliveries-error"');
    expect(html).toContain('data-testid="dispatch-active-error"');
    expect(html).toContain('data-testid="dispatch-waiting-error"');
    expect(html).toContain('dispatch_queue_unavailable');
    expect(html).toContain('waiting_queue_unavailable');
  });
});
