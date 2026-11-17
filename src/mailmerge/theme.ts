import { Button, createTheme } from '@mantine/core'
import classes from './theme.module.css'

export const theme = createTheme({
  components: {
    Button: Button.extend({ classNames: { root: classes.button } }),
  },
})
