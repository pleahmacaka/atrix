export const matchChoice = (
  values: { value: string; name: string }[],
  wanted: string,
) =>
  !wanted
    ? undefined
    : (values.find(v => v.value === wanted)?.value ??
      values.find(v =>
        `${v.value} ${v.name}`.toLowerCase().includes(wanted.toLowerCase()),
      )?.value)
