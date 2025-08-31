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
          title={title}
          subtitle={subtitle}
        />
        <div />
      </header>
  );
}