import React from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';

/**
 * Minimal editable spreadsheet stored on a note as `string[][]` (rows of cell
 * strings). Dependency-free: an horizontally-scrollable grid of TextInput cells
 * with add/delete row + column. Kept small — mobile tables are little.
 */
export function SpreadsheetEditor({
  value,
  onChange,
  onRemove,
}: {
  value: string[][];
  onChange: (next: string[][]) => void;
  onRemove: () => void;
}) {
  const rows = value.length;
  const cols = value[0]?.length ?? 0;

  const setCell = (r: number, c: number, v: string) =>
    onChange(value.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));
  const addRow = () => onChange([...value, Array(cols || 1).fill('')]);
  const addCol = () => onChange(value.map((row) => [...row, '']));
  const deleteRow = (r: number) => rows > 1 && onChange(value.filter((_, ri) => ri !== r));
  const deleteCol = (c: number) => cols > 1 && onChange(value.map((row) => row.filter((_, ci) => ci !== c)));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Table</Text>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Column delete handles + add-column */}
          <View style={styles.row}>
            <View style={styles.corner} />
            {Array.from({ length: cols }).map((_, c) => (
              <Pressable
                key={`ch${c}`}
                onPress={() => deleteCol(c)}
                disabled={cols <= 1}
                style={styles.colHandle}
              >
                <Text style={styles.handleX}>{cols > 1 ? '×' : ''}</Text>
              </Pressable>
            ))}
            <Pressable onPress={addCol} style={styles.addColBtn}>
              <Text style={styles.addGlyph}>＋</Text>
            </Pressable>
          </View>

          {value.map((row, r) => (
            <View key={`r${r}`} style={styles.row}>
              <Pressable
                onPress={() => deleteRow(r)}
                disabled={rows <= 1}
                style={styles.rowHandle}
              >
                <Text style={styles.handleX}>{rows > 1 ? '×' : ''}</Text>
              </Pressable>
              {row.map((cell, c) => (
                <TextInput
                  key={`c${r}-${c}`}
                  value={cell}
                  onChangeText={(v) => setCell(r, c, v)}
                  style={styles.cell}
                  placeholderTextColor={colors.textMuted}
                />
              ))}
            </View>
          ))}

          <Pressable onPress={addRow} style={styles.addRowBtn}>
            <Text style={styles.addGlyph}>＋ Row</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const CELL_W = 96;
const CELL_H = 40;
const HANDLE = 24;

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.small, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.4 },
  remove: { fontSize: fontSize.small, fontWeight: '700', color: colors.danger },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  corner: { width: HANDLE, height: HANDLE },
  colHandle: { width: CELL_W, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  rowHandle: { width: HANDLE, height: CELL_H, alignItems: 'center', justifyContent: 'center' },
  handleX: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },
  cell: {
    width: CELL_W,
    height: CELL_H,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: 8,
    fontSize: fontSize.small,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  addColBtn: { width: HANDLE + 8, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  addRowBtn: {
    marginLeft: HANDLE,
    height: CELL_H,
    width: CELL_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGlyph: { fontSize: 14, color: colors.accent, fontWeight: '700' },
});
