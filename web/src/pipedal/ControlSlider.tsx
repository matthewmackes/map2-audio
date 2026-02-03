/*
 *   Copyright (c) 2025 Robin E. R. Davies
 *   All rights reserved.

 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 */

import React, {useEffect} from "react";
import { NumberInput } from '../map2/components/NumberInput';
import Typography from "@mui/material/Typography";
import { PiPedalModelFactory,State } from "./PiPedalModel";

    function formatDuration(value_: number) {
        let value = Math.ceil(value_);
        const minute = Math.floor(value / 60);
        const secondLeft = value - minute * 60;
        return `${minute}:${secondLeft < 10 ? `0${secondLeft}` : secondLeft}`;
    }

export interface ControlSliderProps {
    instanceId: number;
    controlKey: string;
    duration: number;
    onPreviewValue: (value: number) => void;
    onValueChanged: (value: number) => void; // Callback when the value changes
    style?: React.CSSProperties;
}


function ControlSlider(props: ControlSliderProps) {
    const { style, instanceId, controlKey, duration,
        onPreviewValue, onValueChanged } = props;

    const model = PiPedalModelFactory.getInstance();

    let [sliderValue, setSliderValue] = React.useState(0);
    let [effectiveValue, setEffectiveValue] = React.useState(0);
    let [dragging, setDragging] = React.useState(false);
    let [serverConnected,setServerConnected] = React.useState(model.state.get() === State.Ready);
    const handleStateChanged = (state: State) => {
        setServerConnected(state === State.Ready);
    };
    useEffect(() => {
        model.state.addOnChangedHandler(handleStateChanged);
        if (model.state.get() !== State.Ready) {
            return () => {
                model.state.removeOnChangedHandler(handleStateChanged);
            };
        }
        let handle = model.monitorPort(instanceId, controlKey, 1.0/15.0,(value: number) => {
            setSliderValue(value);
        });
        return () => {
            model.state.removeOnChangedHandler(handleStateChanged);
            model.unmonitorPort(handle);
        };
    }, [instanceId,controlKey,serverConnected]);

    const currentValue = dragging ? effectiveValue : sliderValue;

    return (
        <div style={{ display: "flex", flexFlow: "column nowrap", ...style }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Typography variant="caption" style={{ minWidth: 50 }}>
                    {formatDuration(currentValue)}
                </Typography>
                <NumberInput
                    value={currentValue}
                    min={0}
                    max={duration}
                    step={1}
                    onChange={(v) => {
                        setDragging(false);
                        setSliderValue(v);
                        onValueChanged(v);
                    }}
                    disabled={duration === 0}
                    size="small"
                    fullWidth
                />
                <Typography variant="caption" style={{ minWidth: 50, textAlign: 'right' }}>
                    {formatDuration(duration)}
                </Typography>
            </div>
        </div>
    );
}

export default ControlSlider;