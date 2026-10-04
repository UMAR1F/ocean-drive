import React, { useEffect, useState } from 'react';
import { Button, Group, Modal, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

export default function StockAdjustmentModal({ opened, onClose, product, onConfirm, loading }) {
	const [quantity, setQuantity] = useState(1);
	const [costPrice, setCostPrice] = useState('');
	const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));

	useEffect(() => {
		if (!product) return;
		setQuantity(1);
		setCostPrice(product.costPrice ?? '');
		setAdjustmentDate(new Date().toISOString().slice(0, 10));
	}, [product]);

	if (!product) return null;

	const currentStock = Number(product.stock || 0);
	const newStock = currentStock + quantity;
	const unit = product.uom || 'units';

	const handleClose = () => {
		setQuantity(1);
		setCostPrice('');
		setAdjustmentDate(new Date().toISOString().slice(0, 10));
		onClose();
	};

	const handleSubmit = (event) => {
		event.preventDefault();
		if (Number.isInteger(quantity) && quantity > 0 && Number(costPrice) >= 0 && adjustmentDate) {
			onConfirm({ quantity, costPrice: Number(costPrice), adjustmentDate });
		}
	};

	return (
		<Modal opened={opened} onClose={handleClose} title={`Add stock: ${product.name}`} centered>
			<form onSubmit={handleSubmit}>
				<Stack gap="md">
					<Text size="sm" c="dimmed">
						Enter the quantity received. This adds to current stock; it does not replace it.
					</Text>
					<NumberInput
						label={`Quantity to add (${unit})`}
						value={quantity}
						onChange={(value) => setQuantity(Number(value) || 0)}
						min={1}
						allowDecimal={false}
						decimalScale={0}
						required
						autoFocus
					/>
					<NumberInput
						label="Cost price for added stock"
						value={costPrice}
						onChange={setCostPrice}
						min={0}
						decimalScale={2}
						prefix="₦"
						required
					/>
					<TextInput
						label="Stock update date"
						type="date"
						value={adjustmentDate}
						onChange={(event) => setAdjustmentDate(event.currentTarget.value)}
						required
					/>
					<Paper withBorder p="sm" radius="sm">
						<Group justify="space-between">
							<Text size="sm" c="dimmed">Current stock</Text>
							<Text fw={600}>{currentStock} {unit}</Text>
						</Group>
						<Group justify="space-between" mt="xs">
							<Text size="sm" c="dimmed">After addition</Text>
							<Text fw={700} c="teal.7">{newStock} {unit}</Text>
						</Group>
					</Paper>
					<Group justify="flex-end">
						<Button variant="default" onClick={handleClose} disabled={loading}>Cancel</Button>
						<Button type="submit" leftSection={<IconPlus size={16} />} loading={loading} disabled={!Number.isInteger(quantity) || quantity < 1}>
							Add {quantity || 0} {unit}
						</Button>
					</Group>
				</Stack>
			</form>
		</Modal>
	);
}
