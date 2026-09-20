// uvc-util-win: a small Windows-native stand-in for macOS's uvc-util,
// speaking the *same* command-line interface (-V, -o, -s, -S, -c,
// --list-devices) so pixy-uvc.ts and every PTZ/Image Control action work
// completely unchanged on Windows -- only this helper differs per platform.
//
// Drives the camera's standard UVC controls via DirectShow's IAMCameraControl
// (pan/tilt/zoom/focus/exposure) and IAMVideoProcAmp (brightness/contrast/
// white balance/etc.) COM interfaces -- the Windows-native equivalent of
// macOS's IOKit-based UVC control that uvc-util wraps. See DirectShow.cs for
// the interop declarations.
using System.Globalization;
using UvcUtilWin;

const int FLAG_AUTO = 0x0001;
const int FLAG_MANUAL = 0x0002;

var controls = new Dictionary<string, ControlSpec>(StringComparer.OrdinalIgnoreCase)
{
    ["zoom-abs"] = new(Iface.CameraControl, (int)CameraControlProperty.Zoom, IsAutoToggle: false),
    ["zoom-rel"] = new(Iface.CameraControl, (int)CameraControlProperty.Zoom, IsAutoToggle: false),
    ["focus-abs"] = new(Iface.CameraControl, (int)CameraControlProperty.Focus, IsAutoToggle: false),
    ["focus-rel"] = new(Iface.CameraControl, (int)CameraControlProperty.Focus, IsAutoToggle: false),
    ["exposure-time-abs"] = new(Iface.CameraControl, (int)CameraControlProperty.Exposure, IsAutoToggle: false),
    ["auto-focus"] = new(Iface.CameraControl, (int)CameraControlProperty.Focus, IsAutoToggle: true),
    ["auto-exposure-mode"] = new(Iface.CameraControl, (int)CameraControlProperty.Exposure, IsAutoToggle: true),
    ["brightness"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Brightness, IsAutoToggle: false),
    ["contrast"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Contrast, IsAutoToggle: false),
    ["saturation"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Saturation, IsAutoToggle: false),
    ["sharpness"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Sharpness, IsAutoToggle: false),
    ["gamma"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Gamma, IsAutoToggle: false),
    ["gain"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Gain, IsAutoToggle: false),
    ["backlight-compensation"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.BacklightCompensation, IsAutoToggle: false),
    ["white-balance-temp"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.WhiteBalance, IsAutoToggle: false),
    ["auto-white-balance-temp"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.WhiteBalance, IsAutoToggle: true),
    ["hue"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Hue, IsAutoToggle: false),
    ["auto-hue"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Hue, IsAutoToggle: true),
    ["auto-contrast"] = new(Iface.VideoProcAmp, (int)VideoProcAmpProperty.Contrast, IsAutoToggle: true),
};

try
{
    return Run(args);
}
catch (Exception ex)
{
    Console.Error.WriteLine($"uvc-util-win: {ex.Message}");
    return 1;
}

int Run(string[] argv)
{
    if (argv.Length == 0 || argv[0] == "--help")
    {
        PrintUsage();
        return 0;
    }
    if (argv[0] == "--version")
    {
        Console.WriteLine("uvc-util-win 1.0.0 (DirectShow)");
        return 0;
    }
    if (argv[0] == "--list-devices")
    {
        ListDevices();
        return 0;
    }

    string? target = null;
    string? mode = null; // "-o" | "-s" | "-S" | "-c"
    string? controlArg = null; // control name, or "control=value" for -s

    for (int i = 0; i < argv.Length; i++)
    {
        switch (argv[i])
        {
            case "-V":
                target = argv[++i];
                break;
            case "-o":
            case "-s":
            case "-S":
                mode = argv[i];
                controlArg = argv[++i];
                break;
            case "-c":
                mode = "-c";
                break;
            default:
                throw new ArgumentException($"Unrecognized argument \"{argv[i]}\".");
        }
    }

    if (target is null)
        throw new ArgumentException("Missing -V <vendorid>:<productid>.");

    var (vendorId, productId) = ParseTarget(target);
    var device = FindDevice(vendorId, productId);
    var filterObj = DeviceEnumerator.BindToFilter(device.Moniker);

    switch (mode)
    {
        case "-c":
            ListSupportedControls(filterObj);
            return 0;
        case "-o":
            Console.WriteLine(GetControl(filterObj, controlArg!));
            return 0;
        case "-S":
            PrintRange(filterObj, controlArg!);
            return 0;
        case "-s":
            SetControl(filterObj, controlArg!);
            return 0;
        default:
            throw new ArgumentException("Specify one of -o, -s, -S, or -c.");
    }
}

(string vendorId, string productId) ParseTarget(string target)
{
    var parts = target.Trim().Split(':');
    if (parts.Length != 2)
        throw new ArgumentException($"-V target \"{target}\" isn't in \"0xVVVV:0xPPPP\" form.");
    return (parts[0].Replace("0x", "", StringComparison.OrdinalIgnoreCase), parts[1].Replace("0x", "", StringComparison.OrdinalIgnoreCase));
}

CaptureDevice FindDevice(string vendorId, string productId)
{
    var devices = DeviceEnumerator.EnumerateVideoInputDevices();
    var match = devices.FirstOrDefault((d) => d.MatchesTarget(vendorId, productId));
    if (match is not null)
        return match;

    var available = devices.Count == 0
        ? "(no video capture devices found at all)"
        : string.Join("\n  ", devices.Select((d) => $"{d.FriendlyName} -- vid_{d.VendorId ?? "?"} pid_{d.ProductId ?? "?"}"));
    throw new InvalidOperationException($"No video capture device matched vid_{vendorId}:pid_{productId}. Devices found:\n  {available}");
}

void ListDevices()
{
    var devices = DeviceEnumerator.EnumerateVideoInputDevices();
    if (devices.Count == 0)
    {
        Console.WriteLine("No video capture devices found.");
        return;
    }
    foreach (var d in devices)
    {
        var idPart = d.VendorId is not null ? $"0x{d.VendorId}:0x{d.ProductId}" : "(not a USB device)";
        Console.WriteLine($"{d.FriendlyName}\t{idPart}");
    }
}

(Iface iface, int property, bool isAuto) ResolveControl(string name)
{
    if (name.Equals("pan-tilt-abs", StringComparison.OrdinalIgnoreCase))
        throw new InvalidOperationException("pan-tilt-abs is handled specially -- this shouldn't be reached.");
    if (!controls.TryGetValue(name, out var spec))
        throw new ArgumentException($"Unknown or unsupported control \"{name}\".");
    return (spec.Iface, spec.Property, spec.IsAutoToggle);
}

string GetControl(object filter, string name)
{
    if (name.Equals("pan-tilt-abs", StringComparison.OrdinalIgnoreCase))
    {
        int panVal = GetCamValue(filter, CameraControlProperty.Pan);
        int tiltVal = GetCamValue(filter, CameraControlProperty.Tilt);
        return $"{{pan={panVal},tilt={tiltVal}}}";
    }

    var (iface, property, isAuto) = ResolveControl(name);
    if (iface == Iface.CameraControl)
    {
        int value = GetCamValueEx(filter, (CameraControlProperty)property, out var flags);
        return isAuto ? (((int)flags & FLAG_AUTO) != 0 ? "1" : "0") : value.ToString(CultureInfo.InvariantCulture);
    }
    else
    {
        int value = GetProcValueEx(filter, (VideoProcAmpProperty)property, out var flags);
        return isAuto ? (((int)flags & FLAG_AUTO) != 0 ? "1" : "0") : value.ToString(CultureInfo.InvariantCulture);
    }
}

void SetControl(object filter, string controlEqualsValue)
{
    var eq = controlEqualsValue.IndexOf('=');
    if (eq < 0)
        throw new ArgumentException($"-s argument \"{controlEqualsValue}\" isn't in \"control=value\" form.");
    var name = controlEqualsValue[..eq];
    var valueSpec = controlEqualsValue[(eq + 1)..];

    if (name.Equals("pan-tilt-abs", StringComparison.OrdinalIgnoreCase))
    {
        var panMatch = System.Text.RegularExpressions.Regex.Match(valueSpec, @"pan\s*=\s*(-?\d+)");
        var tiltMatch = System.Text.RegularExpressions.Regex.Match(valueSpec, @"tilt\s*=\s*(-?\d+)");
        if (!panMatch.Success || !tiltMatch.Success)
            throw new ArgumentException($"Couldn't parse pan-tilt-abs value \"{valueSpec}\" -- expected {{pan=N,tilt=N}}.");
        SetCamValue(filter, CameraControlProperty.Pan, int.Parse(panMatch.Groups[1].Value, CultureInfo.InvariantCulture), CameraControlFlags.Manual);
        SetCamValue(filter, CameraControlProperty.Tilt, int.Parse(tiltMatch.Groups[1].Value, CultureInfo.InvariantCulture), CameraControlFlags.Manual);
        return;
    }

    var (iface, property, isAuto) = ResolveControl(name);
    if (isAuto)
    {
        bool on = ResolveAutoOn(valueSpec);
        var flagBits = (CameraControlFlags)(on ? FLAG_AUTO : FLAG_MANUAL);
        if (iface == Iface.CameraControl)
        {
            int current = GetCamValue(filter, (CameraControlProperty)property);
            SetCamValue(filter, (CameraControlProperty)property, current, flagBits);
        }
        else
        {
            int current = GetProcValue(filter, (VideoProcAmpProperty)property);
            SetProcValue(filter, (VideoProcAmpProperty)property, current, (VideoProcAmpFlags)flagBits);
        }
        return;
    }

    if (iface == Iface.CameraControl)
    {
        var (min, max, _, def, _) = GetCamRange(filter, (CameraControlProperty)property);
        int value = ResolveNumericValue(valueSpec, min, max, def);
        SetCamValue(filter, (CameraControlProperty)property, value, CameraControlFlags.Manual);
    }
    else
    {
        var (min, max, _, def, _) = GetProcRange(filter, (VideoProcAmpProperty)property);
        int value = ResolveNumericValue(valueSpec, min, max, def);
        SetProcValue(filter, (VideoProcAmpProperty)property, value, VideoProcAmpFlags.Manual);
    }
}

void PrintRange(object filter, string name)
{
    if (name.Equals("pan-tilt-abs", StringComparison.OrdinalIgnoreCase))
    {
        var pan = GetCamRange(filter, CameraControlProperty.Pan);
        var tilt = GetCamRange(filter, CameraControlProperty.Tilt);
        Console.WriteLine("pan-tilt-abs {");
        Console.WriteLine($"  pan:  minimum={pan.min} maximum={pan.max} step-size={pan.step} default={pan.def} current={pan.current}");
        Console.WriteLine($"  tilt: minimum={tilt.min} maximum={tilt.max} step-size={tilt.step} default={tilt.def} current={tilt.current}");
        Console.WriteLine("}");
        return;
    }

    var (iface, property, _) = ResolveControl(name);
    var r = iface == Iface.CameraControl ? GetCamRange(filter, (CameraControlProperty)property) : GetProcRange(filter, (VideoProcAmpProperty)property);
    Console.WriteLine($"{name} {{");
    Console.WriteLine($"  minimum: {r.min}");
    Console.WriteLine($"  maximum: {r.max}");
    Console.WriteLine($"  step-size: {r.step}");
    Console.WriteLine($"  default-value: {r.def}");
    Console.WriteLine($"  current-value: {r.current}");
    Console.WriteLine("}");
}

void ListSupportedControls(object filter)
{
    foreach (var (name, spec) in controls.OrderBy((kv) => kv.Key, StringComparer.OrdinalIgnoreCase))
    {
        bool supported = spec.Iface == Iface.CameraControl
            ? TryGetCamRange(filter, (CameraControlProperty)spec.Property, out _)
            : TryGetProcRange(filter, (VideoProcAmpProperty)spec.Property, out _);
        if (supported)
            Console.WriteLine(name);
    }
    Console.WriteLine("pan-tilt-abs");
}

int ResolveNumericValue(string spec, int min, int max, int def)
{
    switch (spec.Trim().ToLowerInvariant())
    {
        case "default":
            return def;
        case "minimum":
            return min;
        case "maximum":
            return max;
        default:
            if (!double.TryParse(spec, NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                throw new ArgumentException($"Couldn't parse value \"{spec}\" as a number, fraction, or default/minimum/maximum.");
            // A value with a decimal point in [0,1] is treated as a fraction of
            // the real range (matching uvc-util's documented convention);
            // anything else is a raw value.
            if (spec.Contains('.') && d is >= 0.0 and <= 1.0)
                return (int)Math.Round(min + d * (max - min));
            return (int)Math.Round(d);
    }
}

bool ResolveAutoOn(string spec)
{
    switch (spec.Trim().ToLowerInvariant())
    {
        case "maximum":
            return true;
        case "minimum":
            return false;
        case "default":
            return true;
        default:
            if (double.TryParse(spec, NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
                return d >= 0.5;
            throw new ArgumentException($"Couldn't parse on/off value \"{spec}\".");
    }
}

int GetCamValue(object filter, CameraControlProperty property) => GetCamValueEx(filter, property, out _);

int GetCamValueEx(object filter, CameraControlProperty property, out CameraControlFlags flags)
{
    var cam = (IAMCameraControl)filter;
    int hr = cam.Get(property, out var value, out flags);
    if (hr != 0)
        throw new InvalidOperationException($"IAMCameraControl.Get({property}) failed (hr=0x{hr:X8}). The camera may not support this control.");
    return value;
}

void SetCamValue(object filter, CameraControlProperty property, int value, CameraControlFlags flags)
{
    var cam = (IAMCameraControl)filter;
    int hr = cam.Set(property, value, flags);
    if (hr != 0)
        throw new InvalidOperationException($"IAMCameraControl.Set({property}, {value}) failed (hr=0x{hr:X8}). The camera may not support this control or value.");
}

(int min, int max, int step, int def, int current) GetCamRange(object filter, CameraControlProperty property)
{
    var cam = (IAMCameraControl)filter;
    int hr = cam.GetRange(property, out var min, out var max, out var step, out var def, out _);
    if (hr != 0)
        throw new InvalidOperationException($"IAMCameraControl.GetRange({property}) failed (hr=0x{hr:X8}). The camera may not support this control.");
    int current = GetCamValue(filter, property);
    return (min, max, step, def, current);
}

bool TryGetCamRange(object filter, CameraControlProperty property, out (int min, int max, int step, int def, int current) range)
{
    try
    {
        range = GetCamRange(filter, property);
        return true;
    }
    catch
    {
        range = default;
        return false;
    }
}

int GetProcValue(object filter, VideoProcAmpProperty property) => GetProcValueEx(filter, property, out _);

int GetProcValueEx(object filter, VideoProcAmpProperty property, out VideoProcAmpFlags flags)
{
    var proc = (IAMVideoProcAmp)filter;
    int hr = proc.Get(property, out var value, out flags);
    if (hr != 0)
        throw new InvalidOperationException($"IAMVideoProcAmp.Get({property}) failed (hr=0x{hr:X8}). The camera may not support this control.");
    return value;
}

void SetProcValue(object filter, VideoProcAmpProperty property, int value, VideoProcAmpFlags flags)
{
    var proc = (IAMVideoProcAmp)filter;
    int hr = proc.Set(property, value, flags);
    if (hr != 0)
        throw new InvalidOperationException($"IAMVideoProcAmp.Set({property}, {value}) failed (hr=0x{hr:X8}). The camera may not support this control or value.");
}

(int min, int max, int step, int def, int current) GetProcRange(object filter, VideoProcAmpProperty property)
{
    var proc = (IAMVideoProcAmp)filter;
    int hr = proc.GetRange(property, out var min, out var max, out var step, out var def, out _);
    if (hr != 0)
        throw new InvalidOperationException($"IAMVideoProcAmp.GetRange({property}) failed (hr=0x{hr:X8}). The camera may not support this control.");
    int current = GetProcValue(filter, property);
    return (min, max, step, def, current);
}

bool TryGetProcRange(object filter, VideoProcAmpProperty property, out (int min, int max, int step, int def, int current) range)
{
    try
    {
        range = GetProcRange(filter, property);
        return true;
    }
    catch
    {
        range = default;
        return false;
    }
}

void PrintUsage()
{
    Console.WriteLine("uvc-util-win -- Windows stand-in for macOS's uvc-util, same CLI shape.");
    Console.WriteLine();
    Console.WriteLine("  -V <0xVVVV:0xPPPP>       target device (required for -o/-s/-S/-c)");
    Console.WriteLine("  -o <control>             get the control's current value");
    Console.WriteLine("  -s <control>=<value>     set the control (raw int, 0.0-1.0 fraction, or default/minimum/maximum)");
    Console.WriteLine("  -S <control>             show the control's range/current value");
    Console.WriteLine("  -c                       list controls this device supports");
    Console.WriteLine("  --list-devices           list every video capture device and its vendor:product id");
    Console.WriteLine("  --version                print the version");
}

internal enum Iface
{
    CameraControl,
    VideoProcAmp,
}

internal sealed record ControlSpec(Iface Iface, int Property, bool IsAutoToggle);
