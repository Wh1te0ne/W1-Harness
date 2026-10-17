using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("W1 Harness")]
[assembly: AssemblyProduct("W1 Harness")]
[assembly: AssemblyDescription("W1 Harness local development launcher")]
[assembly: AssemblyVersion("1.0.0.0")]

internal sealed class LauncherConfig
{
    public string ProjectRoot { get; set; }
    public string PowerShell { get; set; }
    public string Node { get; set; }
}

internal static class W1Launcher
{
    [STAThread]
    private static int Main()
    {
        string logPath = null;
        try
        {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            var config = new JavaScriptSerializer().Deserialize<LauncherConfig>(
                File.ReadAllText(Path.Combine(directory, "launcher.json"), Encoding.UTF8));
            string script = Path.Combine(config.ProjectRoot, "scripts", "w1", "Start-W1.ps1");
            foreach (string path in new[] { script, config.PowerShell, config.Node })
                if (!File.Exists(path)) throw new FileNotFoundException("找不到 W1 启动所需的文件，请重新运行 Install-W1Launcher.ps1。", path);

            string logs = Path.Combine(directory, "logs");
            Directory.CreateDirectory(logs);
            logPath = Path.Combine(logs, "launch-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff") + "-" + Process.GetCurrentProcess().Id + ".log");
            var start = new ProcessStartInfo(config.PowerShell) {
                Arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + script + "\"",
                WorkingDirectory = config.ProjectRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            start.EnvironmentVariables["W1_DESKTOP_LAUNCHER"] = Application.ExecutablePath;
            start.EnvironmentVariables["W1_NODE"] = config.Node;
            using (var log = new StreamWriter(logPath, false, Encoding.UTF8))
            using (var child = new Process { StartInfo = start })
            {
                log.AutoFlush = true;
                DataReceivedEventHandler receive = (sender, data) => {
                    if (data.Data != null) lock (log) log.WriteLine(data.Data);
                };
                child.OutputDataReceived += receive;
                child.ErrorDataReceived += receive;
                child.Start();
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                child.WaitForExit();
                if (child.ExitCode != 0) throw new InvalidOperationException("W1 未能正常启动或运行，请查看日志。");
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message + (logPath == null ? "" : "\n\n日志：" + logPath),
                "W1 Harness 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
