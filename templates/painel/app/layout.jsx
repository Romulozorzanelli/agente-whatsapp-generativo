import "./globals.css";

export const metadata = {
  title: "Base de conhecimento do agente",
  description: "Painel da equipe para treinar o agente de WhatsApp",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
