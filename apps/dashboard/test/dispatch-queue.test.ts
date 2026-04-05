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
              attempts: [
                {
                  attemptId: "550e8400-e29b-41d4-a716-446655440111",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                  companyId: "550e8400-e29b-41d4-a716-446655440000",
                  attemptNumber: 1,
                  driverId: null,
                  status: "pending",
                  expiresAt: "2026-01-01T00:03:00.000Z",
                  resolvedAt: null,
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
              attempts: [
                {
                  attemptId: "550e8400-e29b-41d4-a716-446655440123",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440120",
                  companyId: "550e8400-e29b-41d4-a716-446655440000",
                  attemptNumber: 2,
                  driverId: null,
                  status: "expired",
                  expiresAt: "2026-01-01T00:03:30.000Z",
                  resolvedAt: "2026-01-01T00:04:00.000Z",
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
      }
    });

    expect(html).toContain('data-testid="dispatch-active-list"');
    expect(html).toContain('data-testid="dispatch-waiting-list"');
    expect(html).toContain('order-active');
    expect(html).toContain('order-waiting');
    expect(html).toContain('data-testid="dispatch-active-attempt">1');
    expect(html).toContain('data-testid="dispatch-last-attempt">2:expired');
    expect(html).toContain('Máximo de tentativas privadas atingido');
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
      }
    });

    expect(html).toContain('data-testid="company-deliveries-error"');
    expect(html).toContain('data-testid="dispatch-active-error"');
    expect(html).toContain('data-testid="dispatch-waiting-error"');
    expect(html).toContain('dispatch_queue_unavailable');
    expect(html).toContain('waiting_queue_unavailable');
  });
});
