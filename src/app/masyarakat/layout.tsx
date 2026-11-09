import Navbar from "@/components/layout/Navbar";
import ChatbotWidget from "@/components/chatbot/ChatbotWidget";

export default function MasyarakatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <ChatbotWidget />
    </div>
  );
}
