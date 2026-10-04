import React from 'react';
import { Title, Text, Card } from '@mantine/core';

export default function Dashboard() {
  return (
    <div>
      <Title order={2} mb="xs">Reports & Analytics</Title>
      <Text c="dimmed" size="sm" mb="lg">Overview of store performance and sales metrics</Text>
      
      <Card withBorder shadow="sm" radius="md" p="xl">
        <Text align="center" c="dimmed">Dashboard analytics module coming up next.</Text>
      </Card>
    </div>
  );
}