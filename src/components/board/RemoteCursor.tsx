import { Group, Line, Text } from 'react-konva'

interface RemoteCursorProps {
  x: number
  y: number
  name: string
  color: string
}

export function RemoteCursor({ x, y, name, color }: RemoteCursorProps) {
  return (
    <Group x={x} y={y} listening={false}>
      <Line
        points={[0, 0, 0, 18, 12, 12]}
        fill={color}
        closed={true}
        stroke={color}
        strokeWidth={1}
      />
      <Text
        x={14}
        y={10}
        text={name}
        fontSize={12}
        fill={color}
        fontStyle="bold"
      />
    </Group>
  )
}
