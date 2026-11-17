import { Selector, type SelectorOptionType, type SelectorProps } from '@astryxdesign/core/Selector'

type NotebookSelectorProps = Pick<SelectorProps<SelectorOptionType>,
  'label' | 'options' | 'placeholder' | 'isDisabled' | 'isLoading' | 'hasSearch' | 'searchPlaceholder' | 'emptySearchText'> & {
  value?: string
  onChange(value: string): void
}

export function NotebookSelector(props: NotebookSelectorProps) {
  return <div className="st-picker">
    <Selector size="sm" width="100%" placement="below" {...props} />
  </div>
}
