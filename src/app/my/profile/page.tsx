import { ProfileEditPage } from "@/features/profile/profile-edit-page";
import { requireOnboardedPage } from "@/server/auth/require-onboarded-page";

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  await requireOnboardedPage("/my/profile");
  return <ProfileEditPage returnTo={returnTo} />;
}
