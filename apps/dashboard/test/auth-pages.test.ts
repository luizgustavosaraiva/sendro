import { describe, expect, it } from "vitest";
import LoginPage from "../src/app/(auth)/login/page";
import RegisterPage from "../src/app/(auth)/register/page";
import { renderDashboardPage } from "../src/app/(app)/dashboard/page";
import { isProtectedPath } from "../src/middleware";

describe("dashboard auth pages", () => {
  it("renders login with actionable fields", () => {
    const html = LoginPage();
    expect(html).toContain("Login Sendro");
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain("Criar conta");
  });

  it("renders register with role selector and driver conditional fields script", () => {
    const html = RegisterPage();
    expect(html).toContain("Cadastro Sendro");
    expect(html).toContain('id="role-select"');
    expect(html).toContain("Nome da empresa");
    expect(html).toContain("Nome do entregador");
    expect(html).toContain("Telefone");
  });

  it("renders invite-aware register state with hidden token and driver lock", () => {
    const html = RegisterPage({
      inviteToken: "invitetoken1234567890",
      inviteStatus: "pending",
      inviteCompanyName: "ACME Company",
      inviteCompanySlug: "acme-company"
    });

    expect(html).toContain('data-testid="invite-card"');
    expect(html).toContain('data-testid="invite-token">invitetoken1234567890');
    expect(html).toContain('data-testid="invite-status">pending');
    expect(html).toContain('input type="hidden" name="inviteToken" value="invitetoken1234567890"');
    expect(html).toContain('input type="hidden" name="role" value="driver"');
    expect(html).toContain('select name="role" id="role-select" disabled');
    expect(html).toContain("ACME Company");
  });

  it("renders wrong-role invite diagnostic copy", () => {
    const html = RegisterPage({
      inviteToken: "invitetoken1234567890",
      inviteStatus: "invalid-role",
      inviteError: "Este convite exige uma conta de entregador."
    });

    expect(html).toContain('data-testid="invite-invalid-role"');
    expect(html).toContain("Este convite é destinado a entregadores.");
  });

  it("renders authenticated company dashboard with separated dispatch surfaces", () => {
    const html = renderDashboardPage({
      user: {
        name: "ACME Company",
        email: "company@sendro.test",
        role: "company"
      },
      profile: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "ACME Company",
        stripeCustomerId: "cus_123"
      },
      diagnostics: {
        role: "company",
        profileCreated: true,
        stripeStage: "created"
      },
      bondsState: "loaded",
      bonds: {
        activeRetailers: [
          {
            bondId: "550e8400-e29b-41d4-a716-446655440001",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            entityId: "550e8400-e29b-41d4-a716-446655440002",
            entityType: "retailer",
            status: "active",
            requestedByUserId: "550e8400-e29b-41d4-a716-446655440003",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            entityName: "Loja Centro",
            entitySlug: "loja-centro",
            entityLifecycle: "active"
          }
        ],
        pendingRetailers: [
          {
            bondId: "550e8400-e29b-41d4-a716-446655440004",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            entityId: "550e8400-e29b-41d4-a716-446655440005",
            entityType: "retailer",
            status: "pending",
            requestedByUserId: "550e8400-e29b-41d4-a716-446655440006",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            entityName: "Loja Norte",
            entitySlug: "loja-norte",
            entityLifecycle: "pending"
          }
        ],
        activeDrivers: [
          {
            bondId: "550e8400-e29b-41d4-a716-446655440007",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            entityId: "550e8400-e29b-41d4-a716-446655440008",
            entityType: "driver",
            status: "active",
            requestedByUserId: "550e8400-e29b-41d4-a716-446655440009",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            entityName: "Motorista Sul",
            entityLifecycle: "active"
          }
        ]
      },
      invitations: {
        state: "loaded",
        generatedInvitation: {
          invitationId: "550e8400-e29b-41d4-a716-446655440010",
          token: "generatedtoken123456",
          inviteUrl: "http://localhost:3000/invite/generatedtoken123456"
        },
        invitations: [
          {
            invitationId: "550e8400-e29b-41d4-a716-446655440010",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            token: "generatedtoken123456",
            channel: "link",
            status: "pending",
            invitedContact: "driver@sendro.test",
            expiresAt: "2026-01-04T00:00:00.000Z",
            acceptedAt: null,
            createdByUserId: "550e8400-e29b-41d4-a716-446655440011",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      },
      retailerDeliveries: {
        state: "not-retailer",
        error: "Somente lojistas podem criar entregas pelo dashboard.",
        deliveries: []
      },
      companyDeliveries: {
        state: "loaded",
        activeQueue: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440100",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            retailerId: "550e8400-e29b-41d4-a716-446655440002",
            driverId: "550e8400-e29b-41d4-a716-446655440008",
            externalReference: "pedido-123",
            status: "offered",
            pickupAddress: "Rua A, 123",
            dropoffAddress: "Rua B, 456",
            metadata: { fragile: true },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:30:00.000Z",
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440120",
              deliveryId: "550e8400-e29b-41d4-a716-446655440100",
              companyId: "550e8400-e29b-41d4-a716-446655440000",
              phase: "offered",
              timeoutSeconds: 120,
              activeAttemptNumber: 2,
              activeAttemptId: "550e8400-e29b-41d4-a716-446655440121",
              offeredDriverId: "550e8400-e29b-41d4-a716-446655440008",
              offeredDriverName: "Motorista Sul",
              offeredAt: "2026-01-01T00:30:00.000Z",
              deadlineAt: "2026-01-01T00:32:00.000Z",
              waitingReason: null,
              waitingSince: null,
              rankingVersion: "dispatch-v1",
              assumptions: ["queue uses active bond creation order until richer driver capacity signals arrive in S02/S03"],
              latestSnapshot: [],
              strikes: [],
              attempts: [
                {
                  attemptId: "550e8400-e29b-41d4-a716-446655440121",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                  companyId: "550e8400-e29b-41d4-a716-446655440000",
                  attemptNumber: 2,
                  driverId: "550e8400-e29b-41d4-a716-446655440008",
                  offerStatus: "pending",
                  expiresAt: "2026-01-01T00:32:00.000Z",
                  resolvedAt: null,
                  resolvedByActorType: null,
                  resolvedByActorId: null,
                  resolutionReason: null,
                  candidateSnapshot: null,
                  createdAt: "2026-01-01T00:30:00.000Z",
                  updatedAt: "2026-01-01T00:30:00.000Z"
                }
              ],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:30:00.000Z"
            },
            timeline: [
              {
                eventId: "550e8400-e29b-41d4-a716-446655440101",
                deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                status: "created",
                actorType: "retailer",
                actorId: "550e8400-e29b-41d4-a716-446655440002",
                actorLabel: "Loja Centro",
                sequence: 1,
                metadata: { source: "dashboard" },
                createdAt: "2026-01-01T00:00:00.000Z"
              }
            ]
          }
        ],
        waitingQueue: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440130",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            retailerId: "550e8400-e29b-41d4-a716-446655440002",
            driverId: null,
            externalReference: "pedido-waiting",
            status: "queued",
            pickupAddress: "Rua C, 10",
            dropoffAddress: "Rua D, 20",
            metadata: {},
            createdAt: "2026-01-01T00:10:00.000Z",
            updatedAt: "2026-01-01T00:40:00.000Z",
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440131",
              deliveryId: "550e8400-e29b-41d4-a716-446655440130",
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
              waitingSince: "2026-01-01T00:40:00.000Z",
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [],
              attempts: [
                {
                  attemptId: "550e8400-e29b-41d4-a716-446655440132",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440130",
                  companyId: "550e8400-e29b-41d4-a716-446655440000",
                  attemptNumber: 2,
                  driverId: null,
                  offerStatus: "expired",
                  expiresAt: "2026-01-01T00:39:00.000Z",
                  resolvedAt: "2026-01-01T00:40:00.000Z",
                  resolvedByActorType: "system",
                  resolvedByActorId: null,
                  resolutionReason: "driver_offer_timeout",
                  candidateSnapshot: null,
                  createdAt: "2026-01-01T00:37:00.000Z",
                  updatedAt: "2026-01-01T00:40:00.000Z"
                }
              ],
              createdAt: "2026-01-01T00:10:00.000Z",
              updatedAt: "2026-01-01T00:40:00.000Z"
            },
            timeline: [
              {
                eventId: "550e8400-e29b-41d4-a716-446655440133",
                deliveryId: "550e8400-e29b-41d4-a716-446655440130",
                status: "queued",
                actorType: "system",
                actorId: null,
                actorLabel: "dispatch-engine",
                sequence: 1,
                metadata: { reason: "dispatch_waiting_queue" },
                createdAt: "2026-01-01T00:40:00.000Z"
              }
            ]
          }
        ],
        transitionFeedback: {
          kind: "transitioned",
          deliveryId: "550e8400-e29b-41d4-a716-446655440100",
          status: "in_transit",
          message: "Entrega 550e8400-e29b-41d4-a716-446655440100 atualizada para in_transit."
        },
        deliveries: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440100",
            companyId: "550e8400-e29b-41d4-a716-446655440000",
            retailerId: "550e8400-e29b-41d4-a716-446655440002",
            driverId: "550e8400-e29b-41d4-a716-446655440008",
            externalReference: "pedido-123",
            status: "in_transit",
            pickupAddress: "Rua A, 123",
            dropoffAddress: "Rua B, 456",
            metadata: { fragile: true },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440120",
              deliveryId: "550e8400-e29b-41d4-a716-446655440100",
              companyId: "550e8400-e29b-41d4-a716-446655440000",
              phase: "completed",
              timeoutSeconds: 120,
              activeAttemptNumber: 2,
              activeAttemptId: null,
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
              updatedAt: "2026-01-01T01:00:00.000Z"
            },
            timeline: [
              {
                eventId: "550e8400-e29b-41d4-a716-446655440101",
                deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                status: "created",
                actorType: "retailer",
                actorId: "550e8400-e29b-41d4-a716-446655440002",
                actorLabel: "Loja Centro",
                sequence: 1,
                metadata: { source: "dashboard" },
                createdAt: "2026-01-01T00:00:00.000Z"
              },
              {
                eventId: "550e8400-e29b-41d4-a716-446655440102",
                deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                status: "assigned",
                actorType: "company",
                actorId: "550e8400-e29b-41d4-a716-446655440000",
                actorLabel: "ACME Company",
                sequence: 2,
                metadata: { actor: "dispatcher" },
                createdAt: "2026-01-01T00:20:00.000Z"
              },
              {
                eventId: "550e8400-e29b-41d4-a716-446655440103",
                deliveryId: "550e8400-e29b-41d4-a716-446655440100",
                status: "in_transit",
                actorType: "company",
                actorId: "550e8400-e29b-41d4-a716-446655440000",
                actorLabel: "ACME Company",
                sequence: 3,
                metadata: { lane: "east" },
                createdAt: "2026-01-01T01:00:00.000Z"
              }
            ]
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

    expect(html).toContain("Dashboard autenticado");
    expect(html).toContain('data-testid="user-role">company');
    expect(html).toContain("Lojistas vinculados");
    expect(html).toContain("Solicitações pendentes");
    expect(html).toContain("Entregadores vinculados");
    expect(html).toContain("Convites de entregador");
    expect(html).toContain("Fila operacional da empresa");
    expect(html).toContain("Criação de entrega pelo lojista");
    expect(html).toContain("Resposta do entregador");
    expect(html).toContain("Loja Centro");
    expect(html).toContain("Loja Norte");
    expect(html).toContain("Motorista Sul");
    expect(html).toContain('data-testid="bonds-state">loaded');
    expect(html).toContain('data-testid="invitations-state">loaded');
    expect(html).toContain('data-testid="company-deliveries-state">loaded');
    expect(html).toContain('data-testid="retailer-deliveries-state">not-retailer');
    expect(html).toContain('data-testid="driver-deliveries-state">not-driver');
    expect(html).toContain('data-testid="generate-invitation-button"');
    expect(html).toContain('data-testid="generated-invitation"');
    expect(html).toContain('data-testid="generated-invite-url">http://localhost:3000/invite/generatedtoken123456');
    expect(html).toContain('data-testid="company-delivery-feedback"');
    expect(html).toContain('data-testid="dispatch-active-list"');
    expect(html).toContain('data-testid="dispatch-waiting-list"');
    expect(html).toContain('data-testid="dispatch-phase">offered');
    expect(html).toContain('data-testid="dispatch-waiting-reason">Máximo de tentativas privadas atingido');
    expect(html).toContain('data-testid="dispatch-last-attempt">2:expired');
    expect(html).toContain('data-testid="company-deliveries-list"');
    expect(html).toContain('data-testid="delivery-status-current">Em trânsito');
    expect(html).toContain('data-testid="delivery-transition-form"');
    expect(html).toContain('data-testid="delivery-transition-submit"');
    expect(html).toContain('data-testid="delivery-timeline-list"');
    expect(html).toContain('data-testid="delivery-event-status">Criada');
    expect(html).toContain('data-testid="delivery-event-status">Em trânsito');
    expect(html).toContain('data-testid="delivery-event-sequence">3');
    expect(html).toContain('data-testid="driver-deliveries-not-driver"');
    expect(html).toContain("driver@sendro.test");
    expect(html).toContain("cus_123");
  });

  it("renders stable empty states for company bonds, invitations and company queue", () => {
    const html = renderDashboardPage({
      user: {
        name: "Empty Company",
        email: "empty@sendro.test",
        role: "company"
      },
      profile: {
        name: "Empty Company",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "company",
        profileCreated: true,
        stripeStage: "skipped"
      },
      bondsState: "empty",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      },
      invitations: {
        state: "empty",
        invitations: []
      },
      retailerDeliveries: {
        state: "not-retailer",
        error: "Somente lojistas podem criar entregas pelo dashboard.",
        deliveries: []
      },
      companyDeliveries: {
        state: "empty",
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

    expect(html).toContain('data-testid="bonds-empty"');
    expect(html).toContain("Nenhum vínculo ativo ou pendente foi encontrado para esta empresa.");
    expect(html).toContain("Nenhum lojista vinculado no momento.");
    expect(html).toContain("Nenhuma solicitação pendente no momento.");
    expect(html).toContain("Nenhum entregador vinculado no momento.");
    expect(html).toContain('data-testid="invitation-list-empty"');
    expect(html).toContain("Nenhum convite gerado no momento.");
    expect(html).toContain('data-testid="company-deliveries-empty"');
    expect(html).toContain('data-testid="dispatch-active-empty"');
    expect(html).toContain('data-testid="dispatch-waiting-empty"');
    expect(html).toContain("Nenhuma entrega está na fila operacional desta empresa.");
  });

  it("renders stable upstream failure copy for bonds, invitations and company queue", () => {
    const html = renderDashboardPage({
      user: {
        name: "Error Company",
        email: "error@sendro.test",
        role: "company"
      },
      profile: {
        name: "Error Company",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "company",
        profileCreated: false,
        stripeStage: "unknown"
      },
      bondsState: "error",
      bondsError: "A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados. Diagnóstico: trpc_bonds_listCompanyBonds_failed:500:boom",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      },
      invitations: {
        state: "error",
        error: "A sessão foi resolvida, mas os convites não puderam ser carregados. Diagnóstico: trpc_invitations_listCompanyInvitations_failed:500:boom",
        invitations: []
      },
      retailerDeliveries: {
        state: "not-retailer",
        error: "Somente lojistas podem criar entregas pelo dashboard.",
        deliveries: []
      },
      companyDeliveries: {
        state: "error",
        error: "A sessão foi resolvida, mas a fila de entregas da empresa não pôde ser carregada. Diagnóstico: trpc_deliveries_list_failed:500:boom",
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

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="bonds-error"');
    expect(html).toContain('data-testid="invitation-error"');
    expect(html).toContain('data-testid="company-deliveries-error"');
    expect(html).toContain('data-testid="dispatch-active-error"');
    expect(html).toContain('data-testid="dispatch-waiting-error"');
    expect(html).toContain("A sessão foi resolvida, mas os vínculos da empresa não puderam ser carregados.");
    expect(html).toContain("trpc_bonds_listCompanyBonds_failed:500:boom");
    expect(html).toContain("trpc_invitations_listCompanyInvitations_failed:500:boom");
    expect(html).toContain("trpc_deliveries_list_failed:500:boom");
  });

  it("renders retailer delivery creation surface, feedback and timeline SSR", () => {
    const html = renderDashboardPage({
      user: {
        name: "Retailer User",
        email: "retailer@sendro.test",
        role: "retailer"
      },
      profile: {
        id: "550e8400-e29b-41d4-a716-446655440200",
        name: "Loja Bairro",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "retailer",
        profileCreated: true,
        stripeStage: "created"
      },
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      },
      invitations: {
        state: "not-company",
        error: "Somente contas empresa podem gerar e listar convites.",
        invitations: []
      },
      retailerDeliveries: {
        state: "loaded",
        createFeedback: {
          kind: "created",
          deliveryId: "550e8400-e29b-41d4-a716-446655440201",
          status: "created",
          message: "Entrega 550e8400-e29b-41d4-a716-446655440201 criada com status created."
        },
        deliveries: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440201",
            companyId: "550e8400-e29b-41d4-a716-446655440202",
            retailerId: "550e8400-e29b-41d4-a716-446655440200",
            driverId: null,
            externalReference: "pedido-rt-1",
            status: "created",
            pickupAddress: "Rua Loja, 10",
            dropoffAddress: "Rua Cliente, 99",
            metadata: { notes: "deixar na portaria" },
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            timeline: [
              {
                eventId: "550e8400-e29b-41d4-a716-446655440203",
                deliveryId: "550e8400-e29b-41d4-a716-446655440201",
                status: "created",
                actorType: "retailer",
                actorId: "550e8400-e29b-41d4-a716-446655440200",
                actorLabel: "Loja Bairro",
                sequence: 0,
                metadata: { notes: "deixar na portaria" },
                createdAt: "2026-01-02T00:00:00.000Z"
              }
            ],
            dispatch: null
          }
        ]
      },
      companyDeliveries: {
        state: "not-company",
        error: "Somente contas empresa visualizam a fila operacional de entregas.",
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

    expect(html).toContain('data-testid="retailer-deliveries-state">loaded');
    expect(html).toContain('data-testid="retailer-delivery-feedback"');
    expect(html).toContain('data-testid="retailer-delivery-feedback-message">Entrega 550e8400-e29b-41d4-a716-446655440201 criada com status created.');
    expect(html).toContain('data-testid="delivery-create-submit"');
    expect(html).toContain('data-testid="delivery-company-id-input"');
    expect(html).toContain('data-testid="retailer-deliveries-list"');
    expect(html).toContain('data-testid="delivery-status-current">Criada');
    expect(html).toContain('data-testid="delivery-timeline-list"');
    expect(html).toContain('data-testid="delivery-event-status">Criada');
    expect(html).toContain("deixar na portaria");
  });

  it("renders driver active offer, resolution feedback and strike progression SSR", () => {
    const html = renderDashboardPage({
      user: {
        name: "Driver User",
        email: "driver@sendro.test",
        role: "driver"
      },
      profile: {
        id: "550e8400-e29b-41d4-a716-446655440300",
        name: "Motorista Sul",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "driver",
        profileCreated: true,
        stripeStage: "created"
      },
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      },
      invitations: {
        state: "not-company",
        error: "Somente contas empresa podem gerar e listar convites.",
        invitations: []
      },
      retailerDeliveries: {
        state: "not-retailer",
        error: "Somente lojistas podem criar entregas pelo dashboard.",
        deliveries: []
      },
      companyDeliveries: {
        state: "not-company",
        error: "Somente contas empresa visualizam a fila operacional de entregas.",
        deliveries: [],
        activeQueue: [],
        waitingQueue: []
      },
      driverDeliveries: {
        state: "loaded",
        offerState: "loaded",
        strikeState: "loaded",
        deliveries: [
          {
            deliveryId: "550e8400-e29b-41d4-a716-446655440301",
            companyId: "550e8400-e29b-41d4-a716-446655440302",
            retailerId: "550e8400-e29b-41d4-a716-446655440303",
            driverId: "550e8400-e29b-41d4-a716-446655440300",
            externalReference: "pedido-driver-1",
            status: "offered",
            pickupAddress: "Rua A, 10",
            dropoffAddress: "Rua B, 20",
            metadata: { notes: "campainha azul" },
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:01:00.000Z",
            dispatch: {
              queueEntryId: "550e8400-e29b-41d4-a716-446655440304",
              deliveryId: "550e8400-e29b-41d4-a716-446655440301",
              companyId: "550e8400-e29b-41d4-a716-446655440302",
              phase: "offered",
              timeoutSeconds: 120,
              activeAttemptNumber: 1,
              activeAttemptId: "550e8400-e29b-41d4-a716-446655440305",
              offeredDriverId: "550e8400-e29b-41d4-a716-446655440300",
              offeredDriverName: "Motorista Sul",
              offeredAt: "2026-01-03T00:01:00.000Z",
              deadlineAt: "2026-01-03T00:03:00.000Z",
              waitingReason: null,
              waitingSince: null,
              rankingVersion: "dispatch-v1",
              assumptions: [],
              latestSnapshot: [],
              strikes: [
                {
                  strikeId: "550e8400-e29b-41d4-a716-446655440306",
                  companyId: "550e8400-e29b-41d4-a716-446655440302",
                  driverId: "550e8400-e29b-41d4-a716-446655440300",
                  bondId: "550e8400-e29b-41d4-a716-446655440307",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440301",
                  dispatchAttemptId: "550e8400-e29b-41d4-a716-446655440305",
                  attemptNumber: 1,
                  reason: "driver_declined_capacity",
                  consequence: "bond_suspended",
                  metadata: { totalStrikes: 2 },
                  createdAt: "2026-01-03T00:01:30.000Z"
                }
              ],
              attempts: [
                {
                  attemptId: "550e8400-e29b-41d4-a716-446655440305",
                  deliveryId: "550e8400-e29b-41d4-a716-446655440301",
                  companyId: "550e8400-e29b-41d4-a716-446655440302",
                  attemptNumber: 1,
                  driverId: "550e8400-e29b-41d4-a716-446655440300",
                  offerStatus: "pending",
                  expiresAt: "2026-01-03T00:03:00.000Z",
                  resolvedAt: null,
                  resolvedByActorType: null,
                  resolvedByActorId: null,
                  resolutionReason: null,
                  candidateSnapshot: null,
                  createdAt: "2026-01-03T00:01:00.000Z",
                  updatedAt: "2026-01-03T00:01:00.000Z"
                }
              ],
              createdAt: "2026-01-03T00:00:00.000Z",
              updatedAt: "2026-01-03T00:01:00.000Z"
            },
            timeline: [
              {
                eventId: "550e8400-e29b-41d4-a716-446655440308",
                deliveryId: "550e8400-e29b-41d4-a716-446655440301",
                status: "offered",
                actorType: "system",
                actorId: null,
                actorLabel: "dispatch-engine",
                sequence: 1,
                metadata: {},
                createdAt: "2026-01-03T00:01:00.000Z"
              }
            ]
          }
        ],
        activeOffer: {
          deliveryId: "550e8400-e29b-41d4-a716-446655440301",
          companyId: "550e8400-e29b-41d4-a716-446655440302",
          retailerId: "550e8400-e29b-41d4-a716-446655440303",
          driverId: "550e8400-e29b-41d4-a716-446655440300",
          externalReference: "pedido-driver-1",
          status: "offered",
          pickupAddress: "Rua A, 10",
          dropoffAddress: "Rua B, 20",
          metadata: { notes: "campainha azul" },
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:01:00.000Z",
          dispatch: {
            queueEntryId: "550e8400-e29b-41d4-a716-446655440304",
            deliveryId: "550e8400-e29b-41d4-a716-446655440301",
            companyId: "550e8400-e29b-41d4-a716-446655440302",
            phase: "offered",
            timeoutSeconds: 120,
            activeAttemptNumber: 1,
            activeAttemptId: "550e8400-e29b-41d4-a716-446655440305",
            offeredDriverId: "550e8400-e29b-41d4-a716-446655440300",
            offeredDriverName: "Motorista Sul",
            offeredAt: "2026-01-03T00:01:00.000Z",
            deadlineAt: "2026-01-03T00:03:00.000Z",
            waitingReason: null,
            waitingSince: null,
            rankingVersion: "dispatch-v1",
            assumptions: [],
            latestSnapshot: [],
            strikes: [
              {
                strikeId: "550e8400-e29b-41d4-a716-446655440306",
                companyId: "550e8400-e29b-41d4-a716-446655440302",
                driverId: "550e8400-e29b-41d4-a716-446655440300",
                bondId: "550e8400-e29b-41d4-a716-446655440307",
                deliveryId: "550e8400-e29b-41d4-a716-446655440301",
                dispatchAttemptId: "550e8400-e29b-41d4-a716-446655440305",
                attemptNumber: 1,
                reason: "driver_declined_capacity",
                consequence: "bond_suspended",
                metadata: { totalStrikes: 2 },
                createdAt: "2026-01-03T00:01:30.000Z"
              }
            ],
            attempts: [
              {
                attemptId: "550e8400-e29b-41d4-a716-446655440305",
                deliveryId: "550e8400-e29b-41d4-a716-446655440301",
                companyId: "550e8400-e29b-41d4-a716-446655440302",
                attemptNumber: 1,
                driverId: "550e8400-e29b-41d4-a716-446655440300",
                offerStatus: "pending",
                expiresAt: "2026-01-03T00:03:00.000Z",
                resolvedAt: null,
                resolvedByActorType: null,
                resolvedByActorId: null,
                resolutionReason: null,
                candidateSnapshot: null,
                createdAt: "2026-01-03T00:01:00.000Z",
                updatedAt: "2026-01-03T00:01:00.000Z"
              }
            ],
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:01:00.000Z"
          },
          timeline: [
            {
              eventId: "550e8400-e29b-41d4-a716-446655440308",
              deliveryId: "550e8400-e29b-41d4-a716-446655440301",
              status: "offered",
              actorType: "system",
              actorId: null,
              actorLabel: "dispatch-engine",
              sequence: 1,
              metadata: {},
              createdAt: "2026-01-03T00:01:00.000Z"
            }
          ]
        },
        strikeSummary: {
          total: 1,
          lastStrike: {
            strikeId: "550e8400-e29b-41d4-a716-446655440306",
            companyId: "550e8400-e29b-41d4-a716-446655440302",
            driverId: "550e8400-e29b-41d4-a716-446655440300",
            bondId: "550e8400-e29b-41d4-a716-446655440307",
            deliveryId: "550e8400-e29b-41d4-a716-446655440301",
            dispatchAttemptId: "550e8400-e29b-41d4-a716-446655440305",
            attemptNumber: 1,
            reason: "driver_declined_capacity",
            consequence: "bond_suspended",
            metadata: { totalStrikes: 2 },
            createdAt: "2026-01-03T00:01:30.000Z"
          },
          activeConsequence: "bond_suspended",
          bondStatus: "suspended"
        },
        resolutionFeedback: {
          resolution: "rejected",
          attemptId: "550e8400-e29b-41d4-a716-446655440305",
          queueEntryId: "550e8400-e29b-41d4-a716-446655440304",
          deliveryId: "550e8400-e29b-41d4-a716-446655440301",
          status: "queued",
          strike: {
            strikeId: "550e8400-e29b-41d4-a716-446655440306",
            companyId: "550e8400-e29b-41d4-a716-446655440302",
            driverId: "550e8400-e29b-41d4-a716-446655440300",
            bondId: "550e8400-e29b-41d4-a716-446655440307",
            deliveryId: "550e8400-e29b-41d4-a716-446655440301",
            dispatchAttemptId: "550e8400-e29b-41d4-a716-446655440305",
            attemptNumber: 1,
            reason: "driver_declined_capacity",
            consequence: "bond_suspended",
            metadata: { totalStrikes: 2 },
            createdAt: "2026-01-03T00:01:30.000Z"
          },
          message: "Oferta 550e8400-e29b-41d4-a716-446655440305 rejeitada para a entrega 550e8400-e29b-41d4-a716-446655440301."
        }
      }
    });

    expect(html).toContain('data-testid="driver-deliveries-state">loaded');
    expect(html).toContain('data-testid="driver-offer-card-550e8400-e29b-41d4-a716-446655440301"');
    expect(html).toContain('data-testid="driver-offer-form-inline"');
    expect(html).toContain('data-testid="driver-offer-feedback"');
    expect(html).toContain('data-testid="driver-offer-feedback-resolution">rejected');
    expect(html).toContain('data-testid="driver-offer-feedback-strike">bond_suspended');
    expect(html).toContain('data-testid="driver-strike-summary"');
    expect(html).toContain('data-testid="driver-strike-total">1');
    expect(html).toContain('data-testid="driver-bond-status">Suspenso');
    expect(html).toContain('data-testid="driver-offer-deadline">2026-01-03T00:03:00.000Z');
    expect(html).toContain('data-testid="dispatch-last-attempt">1:pending');
  });

  it("renders deterministic retailer bond-gate and non-company diagnostics", () => {
    const html = renderDashboardPage({
      user: {
        name: "Retailer User",
        email: "retailer@sendro.test",
        role: "retailer"
      },
      profile: {
        name: "Retailer User",
        stripeCustomerId: null
      },
      diagnostics: {
        role: "retailer",
        profileCreated: true,
        stripeStage: "created"
      },
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      bonds: {
        activeRetailers: [],
        pendingRetailers: [],
        activeDrivers: []
      },
      invitations: {
        state: "not-company",
        error: "Somente contas empresa podem gerar e listar convites.",
        invitations: []
      },
      retailerDeliveries: {
        state: "error",
        error: "A sessão foi resolvida, mas as entregas do lojista não puderam ser carregadas. Diagnóstico: bond_active_required:retailer_company",
        deliveries: []
      },
      companyDeliveries: {
        state: "not-company",
        error: "Somente contas empresa visualizam a fila operacional de entregas.",
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

    expect(html).toContain('data-testid="bonds-not-company"');
    expect(html).toContain('data-testid="invitation-not-company"');
    expect(html).toContain('data-testid="retailer-deliveries-error"');
    expect(html).toContain('data-testid="company-deliveries-not-company"');
    expect(html).toContain('data-testid="driver-deliveries-not-driver"');
    expect(html).toContain("Somente contas empresa visualizam vínculos da empresa no dashboard.");
    expect(html).toContain("Somente contas empresa podem gerar e listar convites.");
    expect(html).toContain("bond_active_required:retailer_company");
    expect(html).toContain("Somente contas empresa visualizam a fila operacional de entregas.");
  });

  it("renders operational summary and company drivers availability with explicit diagnostics", () => {
    const html = renderDashboardPage({
      user: { name: "Ops Company", email: "ops@sendro.test", role: "company" },
      profile: { name: "Ops Company", stripeCustomerId: null },
      diagnostics: { role: "company", profileCreated: true, stripeStage: "created" },
      bondsState: "empty",
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      summaryState: "loaded",
      summary: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        window: "all_time",
        assumptions: ["on_time_policy_pending"],
        onTime: { state: "unavailable_policy_pending", reason: "unavailable_policy_pending" },
        kpis: {
          awaitingAcceptance: 2,
          waitingQueue: 1,
          failedAttempts: 3,
          delivered: 11,
          activeDrivers: 4
        }
      },
      driversState: "loaded",
      driversOperational: [
        {
          driverId: "550e8400-e29b-41d4-a716-446655440901",
          driverName: "Motorista Norte",
          companyId: "550e8400-e29b-41d4-a716-446655440900",
          bondId: "550e8400-e29b-41d4-a716-446655440902",
          bondStatus: "active",
          operationalState: "available",
          lastOfferAt: "2026-01-01T00:10:00.000Z",
          lastResolution: "2026-01-01T00:11:00.000Z",
          strikeCount: 1,
          strikeConsequence: "warning",
          pendingOfferCount: 0,
          activeDeliveriesCount: 1,
          failedAttemptsCount: 0,
          assumptions: []
        }
      ],
      invitations: { state: "empty", invitations: [] },
      retailerDeliveries: { state: "not-retailer", error: "Somente lojistas podem criar entregas pelo dashboard.", deliveries: [] },
      companyDeliveries: { state: "empty", deliveries: [], activeQueue: [], waitingQueue: [] },
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

    expect(html).toContain('data-testid="summary-state">loaded');
    expect(html).toContain('data-testid="drivers-state">loaded');
    expect(html).toContain('data-testid="operations-summary-kpis"');
    expect(html).toContain('data-testid="kpi-on-time-state">unavailable_policy_pending');
    expect(html).toContain('data-testid="drivers-operational-list"');
    expect(html).toContain('data-testid="driver-operational-state">Disponível');
  });

  it("renders summary/drivers error and not-company diagnostics without leaking company data", () => {
    const html = renderDashboardPage({
      user: { name: "Retailer User", email: "retailer@sendro.test", role: "retailer" },
      profile: { name: "Retailer User", stripeCustomerId: null },
      diagnostics: { role: "retailer", profileCreated: true, stripeStage: "created" },
      bondsState: "not-company",
      bondsError: "Somente contas empresa visualizam vínculos da empresa no dashboard.",
      bonds: { activeRetailers: [], pendingRetailers: [], activeDrivers: [] },
      summary: null,
      summaryState: "not-company",
      summaryError: "Somente contas empresa visualizam KPIs operacionais da empresa.",
      driversOperational: [],
      driversState: "not-company",
      driversError: "Somente contas empresa visualizam a disponibilidade operacional dos entregadores.",
      invitations: { state: "not-company", error: "Somente contas empresa podem gerar e listar convites.", invitations: [] },
      retailerDeliveries: { state: "empty", deliveries: [] },
      companyDeliveries: { state: "not-company", error: "Somente contas empresa visualizam a fila operacional de entregas.", deliveries: [], activeQueue: [], waitingQueue: [] },
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

    expect(html).toContain('data-testid="operations-summary-not-company"');
    expect(html).toContain('data-testid="drivers-operational-not-company"');
    expect(html).toContain('data-testid="summary-state">not-company');
    expect(html).toContain('data-testid="drivers-state">not-company');
  });

  it("marks dashboard as a protected path", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/login")).toBe(false);
  });
});
