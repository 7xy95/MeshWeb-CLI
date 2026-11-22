# MeshWeb-CLI

A standalone command-line interface for [MeshWeb](https://github.com/7xy95/MeshWeb).

MeshWeb-CLI allows you to run a MeshWeb node, resolve .mesh domains, synchronize with the network, register domains, and update domain endpoints without using the MeshWeb browser.

## Features

- Run a MeshWeb node in the background
- Resolve .mesh domains to their endpoints
- Retrieve full domain registration information
- Synchronize with the MeshWeb network
- Register domains using GPU-accelerated proof-of-work mining
- Start, stop, and monitor mining
- Change domain endpoints using the ownership seed
- JSON output for integration with scripts and other programming languages

## Installation

Download the executable for your platform from the [Releases](7xy95/MeshWeb-CLI/releases) page.

On macOS or Linux, make the executable runnable:

```
chmod +x meshweb
```


## Usage

Start a MeshWeb node:

```
meshweb start
```

View node information:

```
meshweb nodeInfo
```

Resolve a domain:

```
meshweb resolve example.mesh
```

Retrieve its registration information:

```
meshweb info example.mesh
```

Synchronize with the network:

```
meshweb sync
```

Stop the node:

```
meshweb stop
```

## Domain registration

To register a `.mesh` domain, start GPU mining:

```
meshweb mine start example.mesh https://example.com yourSeed
```

View mining statistics:

```
meshweb mine info
```

Stop mining:

```
meshweb mine stop
```

An empty endpoint is also supported:

```
meshweb mine start example.mesh "" yourSeed
```

## Changing an endpoint

To change the endpoint of an existing domain, use the original ownership seed:

```
meshweb change example.mesh https://example.org yourSeed
```

To clear the endpoint:

```
meshweb change example.mesh "" yourSeed
```

## Commands

```
Mesh Web CLI

Usage:
    meshweb <command> [arguments] [options]

Commands:
    start                                   Start a Mesh Web node
    stop                                    Stop the running node
    nodeInfo                                Show node information
    resolve <domain>                        Resolve a .mesh domain
    info <domain>                           Show full domain registration
    sync [start]                            Synchronize with the network
    mine start <domain> <endpoint> <seed>   Start mining a domain
    mine stop                               Stop mining
    mine info                               Show mining information
    change <domain> <endpoint> <seed>       Change a domain endpoint

Options:
    --json                                  Output supported results as JSON
```

## License

Mesh Web CLI is licensed under the MIT License.
