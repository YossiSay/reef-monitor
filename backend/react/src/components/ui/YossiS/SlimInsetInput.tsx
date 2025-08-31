import React from "react";

interface InsetInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
}

export const SlimInsetInput = React.forwardRef<HTMLInputElement, InsetInputProps>(
    ({ label, id, type = "text", ...props }, ref) => {
        return (
            <div className="relative w-full">
                <input
                    id={id}
                    type={type}
                    ref={ref}
                    placeholder=" "
                    {...props}
                    className="peer h-10 w-full rounded-md border border-gray-300 bg-background px-2.5 pt-3 text-sm placeholder-transparent focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <label
                    htmlFor={id}
                    className="absolute left-2.5 top-1.5 text-xs text-muted-foreground transition-all peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-blue-500"
                >
                    {label}
                </label>
            </div>
        );
    }
);

SlimInsetInput.displayName = "SlimInsetInput";