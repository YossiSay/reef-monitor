import {theme, SectionCard, Grid} from '@/components/Common'

export default function SensorGrid ({sensorCards}) {
  return (
      <SectionCard
        title="Sensors"
        subtitle="Live sensor data from connected devices">
        {sensorCards.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.color.inkMuted }}>
            No sensor data yet. Add a device, connect, and press <b>Refresh all</b> (or enable Auto refresh).
          </div>
        ) : (
          <Grid min={280} gap={12}>
            {sensorCards}
          </Grid>
        )}
      </SectionCard>
  );
}