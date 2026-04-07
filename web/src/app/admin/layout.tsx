import { PanelAnalytics } from "../../components/panel-analytics";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <PanelAnalytics />
    </>
  );
}
