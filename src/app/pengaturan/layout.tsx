import ChatbotWidget from "@/components/chatbot/ChatbotWidget";

export default function PengaturanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ChatbotWidget />
    </>
  );
}
