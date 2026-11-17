import { AppShell, Card, Container, Group, SimpleGrid, Text, Title } from '@mantine/core'
import { APPS } from '../apps.ts'
import { AppHeader } from '../shared/AppHeader.tsx'
import { Link } from '../shared/Link.tsx'
import classes from './Landing.module.css'

/** Root page: a card per app. */
export function Landing() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <AppHeader />
      </AppShell.Header>
      <AppShell.Main>
        <Container size="md" py="xl">
          <Title order={1} mb="xs">
            OCI Tools
          </Title>
          <Text c="dimmed" mb="xl">
            Tools to organize the Chilean Olympiad in Informatics. Everything runs in your browser.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {APPS.map(({ path, name, description, icon: Icon }) => (
              <Card key={path} component={Link} to={path} withBorder padding="lg" className={classes.card}>
                <Group gap="sm" mb="xs" wrap="nowrap">
                  <span className={classes.icon}>
                    <Icon size={28} />
                  </span>
                  <Text fw={700} size="lg">
                    {name}
                  </Text>
                </Group>
                <Text size="sm" c="dimmed">
                  {description}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
