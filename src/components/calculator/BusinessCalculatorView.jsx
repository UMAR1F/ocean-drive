import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title
} from '@mantine/core';
import { IconCalculator, IconChartBar, IconRefresh, IconTag } from '@tabler/icons-react';

const toNumber = value => Number(value) || 0;
const formatMoney = value => `₦${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BusinessCalculatorView() {
  const [mode, setMode] = useState('pricing');
  const [unitCost, setUnitCost] = useState(500);
  const [extraCost, setExtraCost] = useState(0);
  const [targetMargin, setTargetMargin] = useState(30);
  const [fixedCosts, setFixedCosts] = useState(250000);
  const [sellingPrice, setSellingPrice] = useState(1000);
  const [variableCost, setVariableCost] = useState(700);
  const [targetProfit, setTargetProfit] = useState(100000);

  const [display, setDisplay] = useState('0');
  const [firstValue, setFirstValue] = useState(null);
  const [operator, setOperator] = useState(null);

  const fullUnitCost = toNumber(unitCost) + toNumber(extraCost);
  const marginRate = Math.min(95, Math.max(0, toNumber(targetMargin))) / 100;
  const recommendedPrice = marginRate < 1 ? fullUnitCost / (1 - marginRate) : 0;
  const unitProfit = recommendedPrice - fullUnitCost;
  const markupRate = fullUnitCost > 0 ? (unitProfit / fullUnitCost) * 100 : 0;

  const contribution = toNumber(sellingPrice) - toNumber(variableCost);
  const breakEvenUnits = contribution > 0 ? Math.ceil(toNumber(fixedCosts) / contribution) : null;
  const targetUnits = contribution > 0 ? Math.ceil((toNumber(fixedCosts) + toNumber(targetProfit)) / contribution) : null;
  const breakEvenRevenue = breakEvenUnits === null ? 0 : breakEvenUnits * toNumber(sellingPrice);

  const resetQuickMath = () => {
    setDisplay('0');
    setFirstValue(null);
    setOperator(null);
  };

  const handleDigit = value => {
    setDisplay(current => {
      if (value === '.' && current.includes('.')) return current;
      if (current === '0' || current === 'Error') return value === '.' ? '0.' : value;
      return current + value;
    });
  };

  const calculate = (left, right, operation) => {
    if (operation === '+') return left + right;
    if (operation === '-') return left - right;
    if (operation === '×') return left * right;
    if (operation === '÷') return right === 0 ? NaN : left / right;
    return right;
  };

  const handleOperator = nextOperator => {
    const current = Number(display);
    if (!Number.isFinite(current)) return;
    if (operator && firstValue !== null) {
      const result = calculate(firstValue, current, operator);
      if (!Number.isFinite(result)) {
        setDisplay('Error');
        setFirstValue(null);
        setOperator(null);
        return;
      }
      setFirstValue(result);
      setDisplay(String(result));
    } else {
      setFirstValue(current);
    }
    setOperator(nextOperator);
    setDisplay('0');
  };

  const handleEquals = () => {
    if (firstValue === null || !operator) return;
    const result = calculate(firstValue, Number(display), operator);
    setDisplay(Number.isFinite(result) ? String(Number(result.toFixed(6))) : 'Error');
    setFirstValue(null);
    setOperator(null);
  };

  return (
    <Box p={{ base: 'xs', md: 'md' }}>
      <Stack gap="lg" maw={1100} mx="auto">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <div>
            <Title order={2}>Business Calculator</Title>
            <Text size="sm" c="dimmed">Set a profitable price, plan break-even, or do quick math.</Text>
          </div>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            data={[
              { value: 'pricing', label: 'Price & margin' },
              { value: 'break-even', label: 'Break-even' },
              { value: 'quick', label: 'Quick math' }
            ]}
          />
        </Group>

        {mode === 'pricing' && (
          <Grid gutter="lg" align="stretch">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Paper withBorder p="md" h="100%">
                <Group gap="xs" mb="md">
                  <IconTag size={18} color="var(--mantine-color-teal-6)" />
                  <Title order={4}>Price builder</Title>
                </Group>
                <Stack gap="sm">
                  <NumberInput label="Purchase cost per unit" leftSection="₦" min={0} decimalScale={2} value={unitCost} onChange={setUnitCost} />
                  <NumberInput label="Extra cost per unit" description="Packaging, delivery, or fees" leftSection="₦" min={0} decimalScale={2} value={extraCost} onChange={setExtraCost} />
                  <NumberInput label="Target profit margin" suffix="%" min={0} max={95} decimalScale={1} value={targetMargin} onChange={setTargetMargin} />
                </Stack>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper withBorder p="md" h="100%">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Recommended selling price</Text>
                <Text size="34px" fw={700} c="teal" mt={4}>{formatMoney(recommendedPrice)}</Text>
                <Text size="sm" c="dimmed" mb="lg">At a {toNumber(targetMargin).toFixed(1)}% gross margin</Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  <Paper withBorder p="sm">
                    <Text size="xs" c="dimmed">Total unit cost</Text>
                    <Text fw={700}>{formatMoney(fullUnitCost)}</Text>
                  </Paper>
                  <Paper withBorder p="sm">
                    <Text size="xs" c="dimmed">Profit per unit</Text>
                    <Text fw={700} c="teal">{formatMoney(unitProfit)}</Text>
                  </Paper>
                  <Paper withBorder p="sm">
                    <Text size="xs" c="dimmed">Markup on cost</Text>
                    <Text fw={700}>{markupRate.toFixed(1)}%</Text>
                  </Paper>
                </SimpleGrid>
              </Paper>
            </Grid.Col>
          </Grid>
        )}

        {mode === 'break-even' && (
          <Grid gutter="lg" align="stretch">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Paper withBorder p="md" h="100%">
                <Group gap="xs" mb="md">
                  <IconChartBar size={18} color="var(--mantine-color-blue-6)" />
                  <Title order={4}>Monthly plan</Title>
                </Group>
                <Stack gap="sm">
                  <NumberInput label="Monthly fixed costs" description="Rent, wages, utilities" leftSection="₦" min={0} decimalScale={2} value={fixedCosts} onChange={setFixedCosts} />
                  <NumberInput label="Selling price per unit" leftSection="₦" min={0} decimalScale={2} value={sellingPrice} onChange={setSellingPrice} />
                  <NumberInput label="Variable cost per unit" description="Purchase cost and per-sale costs" leftSection="₦" min={0} decimalScale={2} value={variableCost} onChange={setVariableCost} />
                  <NumberInput label="Target monthly profit" leftSection="₦" min={0} decimalScale={2} value={targetProfit} onChange={setTargetProfit} />
                </Stack>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper withBorder p="md" h="100%">
                <Title order={4} mb="xs">Sales target</Title>
                {contribution <= 0 ? (
                  <Alert color="red" title="No contribution per sale">
                    Selling price must be higher than variable cost before a break-even target can be calculated.
                  </Alert>
                ) : (
                  <>
                    <Text size="sm" c="dimmed">Each sale contributes {formatMoney(contribution)} toward fixed costs and profit.</Text>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
                      <Paper withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Break-even volume</Text>
                        <Text size="28px" fw={700}>{breakEvenUnits} units</Text>
                        <Text size="sm" c="dimmed">Revenue: {formatMoney(breakEvenRevenue)}</Text>
                      </Paper>
                      <Paper withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Volume for target profit</Text>
                        <Text size="28px" fw={700} c="blue">{targetUnits} units</Text>
                        <Text size="sm" c="dimmed">Target: {formatMoney(targetProfit)} profit</Text>
                      </Paper>
                    </SimpleGrid>
                  </>
                )}
              </Paper>
            </Grid.Col>
          </Grid>
        )}

        {mode === 'quick' && (
          <Paper withBorder p="md" maw={440} w="100%" mx="auto">
            <Group justify="space-between" mb="md">
              <Group gap="xs"><IconCalculator size={20} /><Title order={4}>Quick math</Title></Group>
              <Button variant="subtle" size="xs" leftSection={<IconRefresh size={14} />} onClick={resetQuickMath}>Clear</Button>
            </Group>
            <Paper p="md" mb="md" bg="var(--mantine-color-default-hover)" ta="right" aria-live="polite">
              <Text size="xs" c="dimmed">{firstValue !== null ? `${firstValue} ${operator}` : 'Amount'}</Text>
              <Text size="30px" fw={700} style={{ overflowWrap: 'anywhere' }}>{display}</Text>
            </Paper>
            <SimpleGrid cols={4} spacing="xs">
              <Button variant="light" color="gray" onClick={resetQuickMath}>C</Button>
              <Button variant="light" color="gray" onClick={() => setDisplay(value => String(-toNumber(value)))}>±</Button>
              <Button variant="light" color="gray" onClick={() => setDisplay(value => String(toNumber(value) / 100))}>%</Button>
              <Button variant="light" onClick={() => handleOperator('÷')}>÷</Button>
              {['7', '8', '9'].map(value => <Button key={value} variant="default" onClick={() => handleDigit(value)}>{value}</Button>)}
              <Button variant="light" onClick={() => handleOperator('×')}>×</Button>
              {['4', '5', '6'].map(value => <Button key={value} variant="default" onClick={() => handleDigit(value)}>{value}</Button>)}
              <Button variant="light" onClick={() => handleOperator('-')}>−</Button>
              {['1', '2', '3'].map(value => <Button key={value} variant="default" onClick={() => handleDigit(value)}>{value}</Button>)}
              <Button variant="light" onClick={() => handleOperator('+')}>+</Button>
              <Button variant="default" style={{ gridColumn: 'span 2' }} onClick={() => handleDigit('0')}>0</Button>
              <Button variant="default" onClick={() => handleDigit('.')}>.</Button>
              <Button color="teal" onClick={handleEquals}>=</Button>
            </SimpleGrid>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}