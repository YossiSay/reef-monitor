import {SectionTitle} from "@/components/Common";

export default function PageHeader ({title, subtitle}) {
  return (
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12
      }}>
        <SectionTitle
          title="ESP32 Bluetooth Setup"
          subtitle="Configure over BLE: Wi-Fi, backend, token, and reboot"
        />
        <div />
      </header>
  );
}