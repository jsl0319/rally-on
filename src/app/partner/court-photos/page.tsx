import { OperatorCourtPhotoManagement } from "@/features/partner/operator-court-photo-management";
import { requireOperatorPage } from "@/server/auth/require-onboarded-page";

export default async function PartnerCourtPhotosPage() {
  await requireOperatorPage("/partner/court-photos");
  return <OperatorCourtPhotoManagement />;
}
