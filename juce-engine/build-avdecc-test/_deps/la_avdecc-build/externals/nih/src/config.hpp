/*
* Copyright (C) 2016-2025, L-Acoustics

* This file is part of LA_networkInterfaceHelper.

* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:

*  - Redistributions of source code must retain the above copyright notice,
*    this list of conditions and the following disclaimer.
*  - Redistributions in binary form must reproduce the above copyright
*    notice, this list of conditions and the following disclaimer in the
*    documentation and/or other materials provided with the distribution.
*  - Neither the name of  nor the names of its contributors may be used to
*    endorse or promote products derived from this software without specific
*    prior written permission.

* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
* AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
* IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
* ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
* LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
* CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
* SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
* INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
* CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
* ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
* POSSIBILITY OF SUCH DAMAGE.

* You should have received a copy of the BSD 3-clause License
* along with LA_networkInterfaceHelper.  If not, see <https://opensource.org/licenses/BSD-3-Clause>.
*/

/**
* @file config.hpp
* @author Christophe Calmejane
* @brief CMake config generated file
*/

#pragma once

#include <string>

namespace la
{
namespace networkInterface
{
namespace internals
{
std::string const applicationShortName{ "la_networkInterfaceHelper" };
std::string const applicationLongName{ "Network InterfaceHelper Library" };
std::string const companyName{ "L-Acoustics" };
std::string const companyDomain{ "com" };
std::string const companyURL{ "http://www.l-acoustics.com" };
std::string const projectContact{ "software@l-acoustics.com" };
std::string const versionString{ "1.2.9-beta1" }; // Friendly version (3 digits for release, 3 digits and beta postfix for beta)
std::string const marketingVersion{ "1.2" }; // Marketing version
std::string const cmakeVersionString{ "1.2.9.1" }; // CMake version (3 digits for a release, 4 digits for a beta)
std::string const legalCopyright{ "(c) L-Acoustics and its contributors" };
std::string const readableCopyright{ "Copyright 2016-2026, L-Acoustics and its contributors" };
std::string const buildArchitecture{ "64-bit" };
std::string const buildNumber{ "1002009.00001" };
#ifdef DEBUG
std::string const buildConfiguration{ "Debug" };
#else // !DEBUG
std::string const buildConfiguration{ "Release" };
#endif // DEBUG

} // namespace internals
} // namespace networkInterface
} // namespace la
