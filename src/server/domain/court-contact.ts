import type { CourtContact } from "@/matches/court-contact";
import { courtMoneySummary, type MoneyApplication } from "./court-match-money";

type ContactCourt = {
  operatorContactPhone: string | null;
  operatorContactHours: string | null;
  contactPublishedAt: Date | null;
};

export function currentCourtContact(court: ContactCourt): CourtContact | null {
  return court.contactPublishedAt && court.operatorContactPhone && court.operatorContactHours
    ? { phone: court.operatorContactPhone, hours: court.operatorContactHours } : null;
}

type ContactApplication = MoneyApplication & {
  depositClaimedAt: Date | null;
  receiptRecords: { createdAt: Date }[];
};

/** Access is evaluated for the requesting member's own application, never for the public slot. */
export function canReadCourtContact(input: {
  application: ContactApplication | undefined;
  fee: number;
  endsAt: Date;
  matchStatus: string;
  operatorActive: boolean;
}, now = new Date()) {
  if (!input.operatorActive || !input.application) return false;
  const application = input.application;
  const money = courtMoneySummary(application, input.fee);
  const claimedAt = application.depositClaimedAt;
  const receiptChecked = claimedAt !== null && (
    (application.confirmedAt !== null && application.confirmedAt >= claimedAt)
    || application.receiptRecords.some((record) => record.createdAt >= claimedAt)
  );
  const needsDepositCheck = application.depositClaimedAt !== null && !receiptChecked;
  const unresolved = needsDepositCheck || money.outstandingKrw > 0 || money.reservedKrw > 0 || money.needsReview;
  if (unresolved) return true;
  if (input.matchStatus === "CANCELLED" || !["PENDING", "ACCEPTED", "CONFIRMED"].includes(application.status)) return false;
  return now.getTime() < input.endsAt.getTime() + 24 * 60 * 60_000;
}
