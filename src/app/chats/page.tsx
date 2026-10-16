import { MatchChatList } from "@/features/chats/match-chat-list";
import { requireActivePage } from "@/server/auth/require-onboarded-page";

export default async function ChatsPage() {
  // Chat APIs expose only existing memberships, including operators without a player profile.
  await requireActivePage("/chats");
  return <MatchChatList />;
}
