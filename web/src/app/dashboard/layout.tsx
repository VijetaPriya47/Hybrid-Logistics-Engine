import { PanelAnalytics } from "../../components/panel-analytics";

export default function DashboardLayout({
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
