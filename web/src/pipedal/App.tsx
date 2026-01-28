// Copyright (c) 2022 Robin Davies
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import React from 'react';

import { ThemeProvider, createTheme, StyledEngineProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import VirtualKeyboardHandler from './VirtualKeyboardHandler';
import AppThemed from "./AppThemed";
import { isDarkMode } from './DarkMode';
import Tone3000AuthComplete from './Tone3000AuthComplete';
import FontTest from './FontTest';

import IconTest from './IconTest';

declare module '@mui/material/styles' {
    interface Theme {
        mainBackground: React.CSSProperties['color'];
        toolbarColor: React.CSSProperties['color'];
    }
    interface ThemeOptions {
        mainBackground?: React.CSSProperties['color'];
        toolbarColor?: React.CSSProperties['color'];
    }
    interface Palette {
        actionBar: Palette['primary'];
    }
    interface PaletteOptions {
        actionBar: PaletteOptions['primary'];
    }

}

declare module '@mui/material/Button' {
    interface ButtonPropsVariantOverrides {
        dialogPrimary: true;
        dialogSecondary: true;
    }
}


// declare module '@mui/styles/defaultTheme' {
//     // eslint-disable-next-line @typescript-eslint/no-empty-interface
//     interface DefaultTheme extends Theme { }
// }




const theme = createTheme(
    isDarkMode() ?
        {
            cssVariables: true,
            components: {
                MuiButton: {
                    styleOverrides: {
                        root: {
                            '& .MuiTouchRipple-ripple': {
                                transform: 'scale(1.9)',
                            }
                        },
                        containedPrimary: {
                            borderRadius: '9999px',
                            paddingLeft: "16px", paddingRight: "16px",
                            textTransform: "none"
                        },
                        containedSecondary: {
                            borderRadius: '9999px',
                            paddingLeft: "16px", paddingRight: "16px",
                            textTransform: "none"
                        }

                    },
                    variants: [
                        {
                            props: { variant: 'dialogPrimary' },
                            style: {
                                color: "#FFFFFF"
                            }
                        },
                        {
                            props: { variant: 'dialogSecondary', },
                            style: {
                                color: "rgb(255,255,255,0.7)"
                            },
                        },
                    ],
                },
            },

            palette: {
                mode: 'dark',
                background: {
                    default: '#1a1a1a',  // Deep charcoal
                    paper: '#242424'     // Slightly lighter charcoal
                },
                text: {
                    primary: '#ffffff',    // Pure white text
                    secondary: '#e0e0e0'   // Light gray text
                },
                primary: {
                    main: '#00d4ff',       // Bright cyan
                    light: '#33e8ff',
                    dark: '#0099cc'
                },
                secondary: {
                    main: '#ff6b35',       // Vibrant orange
                    light: '#ff8555',
                    dark: '#cc5428'
                },
                success: {
                    main: '#00ff41',       // Bright lime green
                },
                error: {
                    main: '#ff3333',       // Bright red
                },
                warning: {
                    main: '#ffaa00',       // Bright orange
                },
                info: {
                    main: '#00d4ff',       // Bright cyan
                },
                actionBar: {
                    main: '#1a1a1a',       // Dark background
                    contrastText: '#ffffff' // White text
                }

            },
            mainBackground: "#1a1a1a",   // Deep charcoal
            toolbarColor: '#0d0d0d'       // Even darker for toolbar
        }
        :
        {
            cssVariables: true,
            components: {
                /* make the selection state for MuiListItemButtons more visible */
                MuiListItemButton: {
                    styleOverrides: {
                        root: ({ theme }) => ({
                            '&.Mui-selected': {
                                backgroundColor: '#00d4ff1a', // Cyan tint
                                '&:hover': {
                                    backgroundColor: '#00d4ff2d', // Stronger cyan tint
                                },
                            },
                        }),
                    },
                },
                MuiButton: {
                    styleOverrides: {
                        root: {
                            '& .MuiTouchRipple-root': {
                                borderRadius: 'inherit',
                            },
                            '& .MuiTouchRipple-ripple': {
                                transform: 'scale(1.9)!important',
                            }
                        },
                        containedPrimary: {
                            borderRadius: '9999px',
                            paddingLeft: "16px", paddingRight: "16px",
                            textTransform: "none"
                        },
                        containedSecondary: {
                            borderRadius: '9999px',
                            paddingLeft: "16px", paddingRight: "16px",
                            textTransform: "none"
                        }

                    },
                    variants: [
                        {
                            props: { variant: 'dialogPrimary' },
                            style: {
                                color: "#ffffff"
                            }
                        },
                        {
                            props: { variant: 'dialogSecondary', },
                            style: {
                                color: "rgb(0,0,0,0.6)"
                            },
                        },
                    ],
                },
            },
            palette: {
                mode: 'light',
                background: {
                    default: '#f8f9fa',    // Off-white
                    paper: '#ffffff'       // Pure white
                },
                text: {
                    primary: '#0d0d0d',    // Almost black text
                    secondary: '#4a4a4a'   // Dark gray text
                },
                primary: {
                    main: "#0066cc",       // Deep blue
                    light: '#0080ff',
                    dark: '#004199'
                },
                secondary: {
                    main: "#cc3300",       // Deep orange
                    light: '#ff5522',
                    dark: '#993300'
                },
                success: {
                    main: '#008000',       // Deep green
                },
                error: {
                    main: '#cc0000',       // Deep red
                },
                warning: {
                    main: '#ff8800',       // Deep orange
                },
                info: {
                    main: '#0066cc',       // Deep blue
                },
                actionBar: {
                    main: '#ffffff',       // White background
                    contrastText: '#0d0d0d' // Dark text
                }

            },
            mainBackground: "#f8f9fa",   // Off-white
            toolbarColor: '#ffffff'       // White toolbar

        }
);



type AppThemeProps = {

};


function isTone3000Auth() {
    let url = new URL(window.location.href);
    let param = url.searchParams.get("api_key");
    return (param !== null && param !== "")
}
function isFontTest() {
    let url = new URL(window.location.href);
    let param = url.searchParams.get("fontTest");
    return (param !== null)
}
function isIconTest() {
    let url = new URL(window.location.href);
    let param = url.searchParams.get("iconTest");
    return (param !== null)
}

const App = (class extends React.Component {
    // Before the component mounts, we initialise our state

    constructor(props: AppThemeProps) {
        super(props);
        this.state = {
        };
        if (!App.virtualKeyboardHandler) {
            App.virtualKeyboardHandler = new VirtualKeyboardHandler();
        }
    }

    static virtualKeyboardHandler?: VirtualKeyboardHandler;

    render() {
        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={theme}>
                    <CssBaseline />
                    {
                        isTone3000Auth() && (<Tone3000AuthComplete />)
                        || isFontTest() && (<FontTest />)
                        || isIconTest() && (<IconTest />)
                        || (<AppThemed />)
                    }
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
);

export default App;
