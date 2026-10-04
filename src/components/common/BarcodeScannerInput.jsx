// src/components/common/BarcodeScannerInput.jsx
import React, { useState, useEffect, useRef } from 'react';
import { TextInput, Button, Group, Box, Paper, Text, Badge, ActionIcon } from '@mantine/core';
import { IconBarcode, IconCamera, IconDeviceDesktop, IconX } from '@tabler/icons-react';
import { Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScannerInput({ value, onChange, label, placeholder }) {
  const [mode, setMode] = useState('manual'); // 'manual' | 'camera'
  const scannerInstanceRef = useRef(null);
  const isStartingRef = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    if (mode === 'camera' && !scannerInstanceRef.current && !isStartingRef.current) {
      isStartingRef.current = true;
      const scannerId = 'inline-reader';
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerInstanceRef.current = html5QrCode;

      html5QrCode.start(
        { facingMode: 'environment' },
        { 
          fps: 10, 
          qrbox: { width: 250, height: 100 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          if (isMounted) {
            onChange(decodedText);
            stopCamera();
          }
        },
        (errorMessage) => {
          // Suppress continuous frame scanning parsing warnings
        }
      )
      .then(() => {
        isStartingRef.current = false;
      })
      .catch((err) => {
        console.error("Failed to start camera feed:", err);
        isStartingRef.current = false;
        if (isMounted) setMode('manual');
      });
    }

    return () => {
      isMounted = false;
      if (scannerInstanceRef.current) {
        try {
          if (scannerInstanceRef.current.isScanning) {
            scannerInstanceRef.current.stop().then(() => {
              scannerInstanceRef.current.clear();
              scannerInstanceRef.current = null;
            }).catch((error) => {
              if (error?.name !== 'AbortError') {
                console.error("Error stopping scanner cleanup:", error);
              }
            });
          } else {
            scannerInstanceRef.current.clear();
            scannerInstanceRef.current = null;
          }
        } catch (e) {
          scannerInstanceRef.current = null;
        }
      }
    };
  }, [mode, onChange]);

  const stopCamera = () => {
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          scannerInstanceRef.current.stop().then(() => {
            scannerInstanceRef.current?.clear();
            scannerInstanceRef.current = null;
            setMode('manual');
          }).catch(err => {
            console.error("Failed to cleanly stop camera", err);
            scannerInstanceRef.current = null;
            setMode('manual');
          });
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    scannerInstanceRef.current = null;
    setMode('manual');
  };

  return (
    <Box mb="sm">
      <Group justify="space-between" mb={4}>
        <Group gap="xs">
          <Text size="sm" fw={500}>{label || 'Barcode / SKU'}</Text>
          {mode === 'manual' && (
            <Badge size="xs" variant="light" color="blue" leftSection={<IconDeviceDesktop size={12} />}>
              Hardware Ready
            </Badge>
          )}
        </Group>

        <Group gap="xs">
          {mode === 'manual' ? (
            <Button 
              size="xs" 
              variant="light" 
              color="teal"
              leftSection={<IconCamera size={14} />}
              onClick={() => setMode('camera')}
            >
              Use Mobile Camera
            </Button>
          ) : (
            <Button 
              size="xs" 
              color="red" 
              variant="light" 
              leftSection={<IconX size={14} />}
              onClick={stopCamera}
            >
              Close Camera
            </Button>
          )}
        </Group>
      </Group>

      {/* Manual Input & External Hardware Scanner Wedge Target */}
      {mode === 'manual' && (
        <TextInput
          ref={inputRef}
          placeholder={placeholder || "Click here & pull hardware scanner trigger, or type..."}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          leftSection={<IconBarcode size={18} />}
          rightSection={
            <ActionIcon 
              variant="subtle" 
              color="gray" 
              title="Click to focus for hardware scanner"
              onClick={() => inputRef.current?.focus()}
            >
              <IconDeviceDesktop size={18} />
            </ActionIcon>
          }
        />
      )}

      {/* Inline Camera Viewfinder */}
      {mode === 'camera' && (
        <Paper withBorder p="xs" radius="md" bg="dark.9">
          <Text size="xs" c="dimmed" ta="center" mb="xs">
            Align product barcode within the frame below:
          </Text>
          <div id="inline-reader" style={{ width: '100%', minHeight: '200px' }}></div>
        </Paper>
      )}
    </Box>
  );
}